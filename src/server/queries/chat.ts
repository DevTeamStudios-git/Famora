import "server-only";

import { prisma } from "@/lib/prisma/client";
import { getDisplayRole } from "@/lib/authorization/roles";

const MESSAGE_PAGE_SIZE = 50;

/**
 * Returns (creating if needed) the family's single FAMILY_CHAT conversation,
 * and makes sure the given member is subscribed to it. Idempotent — safe to
 * call on every page load.
 */
export async function getOrCreateFamilyChatConversation(
  familyId: string,
  memberId: string,
): Promise<string> {
  let conversation = await prisma.conversation.findFirst({
    where: { familyId, type: "FAMILY_CHAT" },
    select: { id: true },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { familyId, type: "FAMILY_CHAT", title: "Family Chat" },
      select: { id: true },
    });
  }

  await prisma.conversationMember.upsert({
    where: {
      conversationId_memberId: {
        conversationId: conversation.id,
        memberId,
      },
    },
    update: {},
    create: { conversationId: conversation.id, memberId },
  });

  return conversation.id;
}

/** Public-safe sender projection — never leaks internalRole (Hidden Admin masking). */
export type MessageSender = {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  body: string;
  type: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: MessageSender | null;
  replyTo: { id: string; body: string; sender: MessageSender | null } | null;
  reactions: { emoji: string; count: number; reactedByMe: boolean }[];
  isPinned: boolean;
  isSavedByMe: boolean;
  isMine: boolean;
};

function toSender(
  member: { id: string; displayRole: string; user: { displayName: string; avatarUrl: string | null } } | null,
): MessageSender | null {
  if (!member) return null;
  return {
    memberId: member.id,
    displayName: member.user.displayName,
    avatarUrl: member.user.avatarUrl,
  };
}

function senderInclude() {
  return {
    sender: {
      select: {
        id: true,
        displayRole: true,
        user: { select: { displayName: true, avatarUrl: true } },
      },
    },
    replyTo: {
      include: {
        sender: {
          select: {
            id: true,
            displayRole: true,
            user: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    },
  };
}

/** Lists the most recent messages in a conversation, oldest first. */
export async function listFamilyMessages(
  conversationId: string,
  viewerMemberId: string,
): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_PAGE_SIZE,
    include: {
      ...senderInclude(),
      reactions: true,
      pinnedMessage: true,
      savedMessages: { where: { memberId: viewerMemberId }, select: { id: true } },
    },
  });

  return rows
    .reverse()
    .map((row) => {
      const reactionMap = new Map<string, { count: number; reactedByMe: boolean }>();
      for (const reaction of row.reactions) {
        const entry = reactionMap.get(reaction.emoji) ?? { count: 0, reactedByMe: false };
        entry.count += 1;
        if (reaction.memberId === viewerMemberId) entry.reactedByMe = true;
        reactionMap.set(reaction.emoji, entry);
      }

      return {
        id: row.id,
        conversationId: row.conversationId,
        body: row.deletedAt ? "" : row.body,
        type: row.type,
        createdAt: row.createdAt.toISOString(),
        editedAt: row.editedAt ? row.editedAt.toISOString() : null,
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        sender: toSender(row.sender),
        replyTo: row.replyTo
          ? {
              id: row.replyTo.id,
              body: row.replyTo.deletedAt ? "" : row.replyTo.body,
              sender: toSender(row.replyTo.sender),
            }
          : null,
        reactions: [...reactionMap.entries()].map(([emoji, v]) => ({
          emoji,
          count: v.count,
          reactedByMe: v.reactedByMe,
        })),
        isPinned: Boolean(row.pinnedMessage),
        isSavedByMe: row.savedMessages.length > 0,
        isMine: row.senderMemberId === viewerMemberId,
      } satisfies ChatMessage;
    });
}

/** Fetches and projects a single message the same way listFamilyMessages does. */
export async function getFamilyMessage(
  messageId: string,
  viewerMemberId: string,
): Promise<ChatMessage | null> {
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      ...senderInclude(),
      reactions: true,
      pinnedMessage: true,
      savedMessages: { where: { memberId: viewerMemberId }, select: { id: true } },
    },
  });
  if (!row) return null;

  const reactionMap = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const reaction of row.reactions) {
    const entry = reactionMap.get(reaction.emoji) ?? { count: 0, reactedByMe: false };
    entry.count += 1;
    if (reaction.memberId === viewerMemberId) entry.reactedByMe = true;
    reactionMap.set(reaction.emoji, entry);
  }

  return {
    id: row.id,
    conversationId: row.conversationId,
    body: row.deletedAt ? "" : row.body,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    sender: toSender(row.sender),
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          body: row.replyTo.deletedAt ? "" : row.replyTo.body,
          sender: toSender(row.replyTo.sender),
        }
      : null,
    reactions: [...reactionMap.entries()].map(([emoji, v]) => ({
      emoji,
      count: v.count,
      reactedByMe: v.reactedByMe,
    })),
    isPinned: Boolean(row.pinnedMessage),
    isSavedByMe: row.savedMessages.length > 0,
    isMine: row.senderMemberId === viewerMemberId,
  } satisfies ChatMessage;
}

/** displayRole helper re-export kept local so query callers don't reach into roles.ts unnecessarily. */
export { getDisplayRole };
