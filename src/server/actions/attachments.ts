"use server";

// Attachment & voice-message finalization for Family Chat (§6, §7, §42.20).
//
// The client uploads files directly to Supabase Storage (see
// src/components/chat/use-attachment-upload.ts) — this action is what turns
// "some objects exist in Storage" into an actual, authorized chat message.
// It is the security boundary: nothing about the client's claims (declared
// MIME type, declared size, declared category) is trusted. Every object is
// re-verified against Storage directly — real size via statUploadedObject,
// real content type via magic-byte sniffing (sniffUploadedMimeType) — before
// anything is written to the database.

import { z } from "zod";
import { prisma } from "@/lib/prisma/client";
import { getAccessState } from "@/lib/auth/session";
import { hasPermission } from "@/lib/authorization/authorization";
import {
  getOrCreateFamilyChatConversation,
  getFamilyMessage,
  type ChatMessage,
} from "@/server/queries/chat";
import { statUploadedObject, sniffUploadedMimeType, deleteUploadedObjects } from "@/lib/storage/sniff";
import {
  categoryForMime,
  maxSizeForCategory,
  isVoiceRecordingMimeType,
  CHAT_MAX_ATTACHMENTS_PER_MESSAGE,
  CHAT_VOICE_MESSAGE_MAX_SIZE,
  VOICE_MESSAGE_MAX_DURATION_SECONDS,
  type AttachmentCategory,
} from "@/lib/validation/attachments";

const STORAGE_BUCKET = "families";

type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const attachmentItemSchema = z.object({
  path: z.string().min(1).max(600),
  fileName: z.string().min(1).max(255),
  caption: z.string().max(500).optional(),
});

const voiceItemSchema = z.object({
  path: z.string().min(1).max(600),
  fileName: z.string().min(1).max(255),
  durationMs: z.number().int().positive(),
});

const inputSchema = z
  .object({
    body: z.string().max(10_000).default(""),
    replyToId: z.string().uuid().optional().nullable(),
    attachments: z.array(attachmentItemSchema).max(CHAT_MAX_ATTACHMENTS_PER_MESSAGE).default([]),
    voice: voiceItemSchema.optional().nullable(),
  })
  .refine((v) => v.body.trim().length > 0 || v.attachments.length > 0 || v.voice, {
    message: "A message needs text, an attachment, or a voice note.",
  })
  .refine((v) => !(v.voice && v.attachments.length > 0), {
    message: "Voice messages can't be combined with other attachments.",
  });

async function requireAuthorized() {
  const access = await getAccessState();
  if (access.status !== "authorized") throw new Error("Not authorized.");
  return access;
}

/**
 * Issues a fresh, family-scoped Storage path for one file and records who's
 * uploading it. The client uploads to exactly this path — nothing else.
 * This binding is what lets finalizeChatMessage() verify "the caller is the
 * one who staged this object" instead of trusting that a syntactically
 * family-scoped path was actually theirs (a random UUID is hard to guess,
 * but authorization must not rest on secrecy of a path).
 */
export async function createUploadStaging(
  fileName: string,
): Promise<ActionResult<{ path: string }>> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "chat.send")) {
    return { ok: false, error: "You don't have permission to send messages." };
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "file";
  const draftId = crypto.randomUUID();
  const path = `${access.familyId}/chat/${draftId}/${safeName}`;

  await prisma.chatUploadStaging.create({
    data: {
      familyId: access.familyId,
      memberId: access.memberId,
      storagePath: path,
      fileName: safeName,
    },
  });

  return { ok: true, data: { path } };
}

/** Cancel path: drops the staging record for an upload the user removed before sending. */
export async function cancelUploadStaging(path: string): Promise<ActionResult> {
  const access = await requireAuthorized();
  await prisma.chatUploadStaging.deleteMany({
    where: { storagePath: path, memberId: access.memberId },
  });
  return { ok: true, data: undefined };
}

/**
 * Verifies every claimed path was actually staged by *this* member, in
 * *this* family — not just that it looks like a family-scoped path. Without
 * this, anyone who learned another member's staged path (e.g. it leaked via
 * logs, a shared screen, a browser extension) could submit it to
 * finalizeChatMessage() and have it attached to a message they didn't
 * upload. A random UUID path is hard to guess, but authorization must not
 * rest on secrecy of a path — see createUploadStaging() above.
 */
async function assertOwnedStagedPaths(
  paths: string[],
  access: { familyId: string; memberId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (paths.length === 0) return { ok: true };
  const rows: { storagePath: string; familyId: string; memberId: string }[] =
    await prisma.chatUploadStaging.findMany({
      where: { storagePath: { in: paths } },
      select: { storagePath: true, familyId: true, memberId: true },
    });
  const byPath = new Map<string, { storagePath: string; familyId: string; memberId: string }>(
    rows.map((r) => [r.storagePath, r]),
  );

  for (const path of paths) {
    const staged = byPath.get(path);
    if (!staged || staged.memberId !== access.memberId || staged.familyId !== access.familyId) {
      return { ok: false, error: "One of those attachments couldn't be verified. Please re-upload." };
    }
  }
  return { ok: true };
}

type VerifiedItem = {
  path: string;
  fileName: string;
  caption: string | null;
  category: AttachmentCategory;
  size: number;
  mimeType: string;
};

/** Verifies one staged object against Storage itself — never the client's claims. */
async function verifyStagedObject(
  path: string,
  fileName: string,
  caption: string | undefined,
): Promise<VerifiedItem | { error: string }> {
  const stat = await statUploadedObject(STORAGE_BUCKET, path);
  if (!stat) return { error: `"${fileName}" wasn't found in storage — upload may have failed.` };

  const mimeType = await sniffUploadedMimeType(STORAGE_BUCKET, path);
  if (!mimeType) return { error: `Couldn't verify the content of "${fileName}".` };

  const category = categoryForMime(mimeType);
  if (!category) return { error: `"${fileName}" isn't a supported file type.` };

  const max = maxSizeForCategory(category);
  if (stat.size > max) {
    return { error: `"${fileName}" is too large for its type.` };
  }

  return { path, fileName, caption: caption ?? null, category, size: stat.size, mimeType };
}

export async function finalizeChatMessage(
  rawInput: unknown,
): Promise<ActionResult<ChatMessage>> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "chat.send")) {
    return { ok: false, error: "You don't have permission to send messages." };
  }

  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };
  }
  const input = parsed.data;

  const allPaths = [
    ...input.attachments.map((a) => a.path),
    ...(input.voice ? [input.voice.path] : []),
  ];

  const ownership = await assertOwnedStagedPaths(allPaths, access);
  if (!ownership.ok) {
    await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
    return { ok: false, error: ownership.error };
  }

  // --- Verify every object against Storage itself (the security boundary) ---
  const verifiedAttachments: VerifiedItem[] = [];
  let verifiedVoice: VerifiedItem | null = null;

  for (const item of input.attachments) {
    const result = await verifyStagedObject(item.path, item.fileName, item.caption);
    if ("error" in result) {
      await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
      return { ok: false, error: result.error };
    }
    verifiedAttachments.push(result);
  }

  if (input.voice) {
    if (input.voice.durationMs > VOICE_MESSAGE_MAX_DURATION_SECONDS * 1000) {
      await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
      return { ok: false, error: "Voice message is too long." };
    }
    const result = await verifyStagedObject(input.voice.path, input.voice.fileName, undefined);
    if ("error" in result) {
      await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
      return { ok: false, error: result.error };
    }
    if (!isVoiceRecordingMimeType(result.mimeType)) {
      await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
      return { ok: false, error: "That doesn't look like a valid voice recording." };
    }
    if (result.size > CHAT_VOICE_MESSAGE_MAX_SIZE) {
      await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
      return { ok: false, error: "Voice message file is too large." };
    }
    verifiedVoice = result;
  }

  const conversationId = await getOrCreateFamilyChatConversation(
    access.familyId,
    access.memberId,
  );

  let replyToId: string | null = null;
  if (input.replyToId) {
    const target = await prisma.message.findFirst({
      where: { id: input.replyToId, conversationId },
      select: { id: true },
    });
    replyToId = target?.id ?? null;
  }

  const messageType = verifiedVoice
    ? "VOICE"
    : input.body.trim()
      ? "TEXT"
      : verifiedAttachments.length === 1
        ? verifiedAttachments[0].category
        : "TEXT";

  // --- Write DB state. Storage writes already happened (client-side, before
  // this action ran); if this transaction fails, we clean up the now-orphaned
  // objects afterward. Not a true distributed transaction across Postgres and
  // Storage (that's not achievable here), but this ordering — verify first,
  // write DB second, clean up Storage only on failure — means a crash never
  // leaves a DB row pointing at a missing/invalid object, only (rarely) an
  // orphaned Storage object with no DB reference, which is a harmless leak,
  // not a correctness or security problem.
  try {
    const created = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          senderMemberId: access.memberId,
          type: messageType,
          body: input.body.trim(),
          replyToId,
          metadata: verifiedVoice ? { durationMs: input.voice!.durationMs } : undefined,
        },
      });

      const items = verifiedVoice ? [verifiedVoice] : verifiedAttachments;
      for (const item of items) {
        const blob = await tx.fileBlob.create({
          data: {
            familyId: access.familyId,
            bucket: STORAGE_BUCKET,
            storagePath: item.path,
            fileName: item.fileName,
            mimeType: item.mimeType,
            size: item.size,
            category: item.category,
          },
        });
        await tx.messageAttachment.create({
          data: { messageId: message.id, blobId: blob.id, caption: item.caption },
        });
      }

      // Staging rows are single-use — clear them now that the objects they
      // guarded are real MessageAttachments.
      if (allPaths.length > 0) {
        await tx.chatUploadStaging.deleteMany({ where: { storagePath: { in: allPaths } } });
      }

      return message;
    });

    const fresh = await getFamilyMessage(created.id, access.memberId);
    return fresh
      ? { ok: true, data: fresh }
      : { ok: false, error: "Message sent." };
  } catch {
    await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
    return { ok: false, error: "Couldn't send that message. Please try again." };
  }
}
