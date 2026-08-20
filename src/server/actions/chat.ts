"use server";

// Family Chat server actions (§6–§8). Every mutation re-checks permissions
// server-side via `hasPermission` — the client only hides buttons it already
// knows will be rejected. Writes go through Prisma; Supabase Realtime picks
// them up from the Postgres WAL (`postgres_changes`), so no separate
// broadcast call is needed here.
//
// Sending a message (text and/or attachments/voice) lives in
// server/actions/attachments.ts (finalizeChatMessage) — that's the single
// send path now, since attachments need the same permission check, reply
// validation, and message-row creation this file used to do on its own.
// Keeping two separate "create a message" code paths would risk their
// permission logic drifting apart.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma/client";
import { getAccessState } from "@/lib/auth/session";
import { hasPermission } from "@/lib/authorization/authorization";
import { getFamilyMessage, listFamilyMessages, listPinnedMessages, type ChatMessage } from "@/server/queries/chat";
import { z } from "zod";

type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

async function requireAuthorized() {
  const access = await getAccessState();
  if (access.status !== "authorized") {
    throw new Error("Not authorized.");
  }
  return access;
}

export async function editFamilyMessage(
  messageId: string,
  body: string,
): Promise<ActionResult> {
  const access = await requireAuthorized();
  const parsed = z.string().trim().min(1).max(10_000).safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Message can't be empty." };
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { senderMemberId: true, body: true, deletedAt: true },
  });
  if (!message || message.deletedAt) {
    return { ok: false, error: "Message not found." };
  }

  const isOwn = message.senderMemberId === access.memberId;
  if (!isOwn || !hasPermission(access.membership, "chat.edit_own")) {
    return { ok: false, error: "You can only edit your own messages." };
  }

  await prisma.$transaction([
    prisma.messageEdit.create({
      data: {
        messageId,
        editorMemberId: access.memberId,
        body: message.body,
      },
    }),
    prisma.message.update({
      where: { id: messageId },
      data: { body: parsed.data, editedAt: new Date() },
    }),
  ]);

  revalidatePath("/chat");
  return { ok: true, data: undefined };
}

export async function deleteFamilyMessage(messageId: string): Promise<ActionResult> {
  const access = await requireAuthorized();

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { senderMemberId: true, deletedAt: true },
  });
  if (!message || message.deletedAt) {
    return { ok: false, error: "Message not found." };
  }

  const isOwn = message.senderMemberId === access.memberId;
  const canDeleteAny = hasPermission(access.membership, "chat.delete_any_message");
  if (!isOwn && !canDeleteAny) {
    return { ok: false, error: "You don't have permission to delete this message." };
  }

  await prisma.message.update({
    where: { id: messageId },
    data: {
      deletedAt: new Date(),
      deletedByMemberId: access.memberId,
      body: "",
    },
  });

  // Administrative deletions of someone else's message are audit-worthy.
  if (!isOwn) {
    await prisma.auditLog.create({
      data: {
        familyId: access.familyId,
        actorMemberId: access.memberId,
        actorRole: access.internalRole,
        action: "chat.delete_any_message",
        targetType: "message",
        targetId: messageId,
        result: "SUCCESS",
      },
    });
  }

  revalidatePath("/chat");
  return { ok: true, data: undefined };
}

export async function toggleMessageReaction(
  messageId: string,
  emoji: string,
): Promise<ActionResult> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "chat.react")) {
    return { ok: false, error: "Reactions are disabled for you." };
  }
  const cleanEmoji = emoji.trim().slice(0, 8);
  if (!cleanEmoji) return { ok: false, error: "Invalid reaction." };

  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_memberId_emoji: {
        messageId,
        memberId: access.memberId,
        emoji: cleanEmoji,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.messageReaction.create({
      data: { messageId, memberId: access.memberId, emoji: cleanEmoji },
    });
  }

  revalidatePath("/chat");
  return { ok: true, data: undefined };
}

export async function togglePinMessage(messageId: string): Promise<ActionResult> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "chat.pin_any_message")) {
    return { ok: false, error: "You don't have permission to pin messages." };
  }

  const existing = await prisma.pinnedMessage.findUnique({
    where: { messageId },
    select: { id: true },
  });

  if (existing) {
    await prisma.pinnedMessage.delete({ where: { id: existing.id } });
  } else {
    await prisma.pinnedMessage.create({
      data: { messageId, memberId: access.memberId },
    });
  }

  revalidatePath("/chat");
  return { ok: true, data: undefined };
}

/** Client-callable re-fetch of one message, used to reconcile realtime events. */
export async function fetchFamilyMessage(
  messageId: string,
): Promise<ChatMessage | null> {
  const access = await requireAuthorized();
  return getFamilyMessage(messageId, access.memberId);
}

/**
 * Resolves a message from a side-effect row (delete events only carry the
 * row's primary key, not the message id) and returns it in the same shape as
 * `fetchFamilyMessage`, so clients can reconcile removed reactions/pins live.
 */
export async function fetchMessageBySideEffect(
  kind: "reaction" | "pin",
  id: string,
): Promise<ChatMessage | null> {
  const access = await requireAuthorized();
  const row =
    kind === "reaction"
      ? await prisma.messageReaction.findUnique({
          where: { id },
          select: { messageId: true },
        })
      : await prisma.pinnedMessage.findUnique({
          where: { id },
          select: { messageId: true },
        });
  if (!row) return null;
  return getFamilyMessage(row.messageId, access.memberId);
}

/**
 * Full list re-sync for a conversation. Used to reconcile anything missed
 * while a realtime channel was reconnecting.
 */
export async function fetchRecentMessages(
  conversationId: string,
): Promise<ChatMessage[]> {
  const access = await requireAuthorized();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { familyId: true },
  });
  if (!conversation || conversation.familyId !== access.familyId) {
    return [];
  }
  return listFamilyMessages(conversationId, access.memberId);
}

/**
 * Full pinned-message list for a conversation, most recently pinned first.
 * Used by the chat room's pinned section (authorization-scoped server-side,
 * then projected — pinned rows never carry hidden admin data).
 */
export async function fetchPinnedMessages(conversationId: string): Promise<ChatMessage[]> {
  const access = await requireAuthorized();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { familyId: true },
  });
  if (!conversation || conversation.familyId !== access.familyId) {
    return [];
  }
  return listPinnedMessages(conversationId, access.memberId);
}

export async function toggleSaveMessage(messageId: string): Promise<ActionResult> {
  const access = await requireAuthorized();

  const existing = await prisma.savedMessage.findUnique({
    where: {
      memberId_messageId: { memberId: access.memberId, messageId },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.savedMessage.delete({ where: { id: existing.id } });
  } else {
    await prisma.savedMessage.create({
      data: { memberId: access.memberId, messageId },
    });
  }

  return { ok: true, data: undefined };
}
