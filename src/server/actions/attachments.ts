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
  sanitizeFileName,
  CHAT_MAX_ATTACHMENTS_PER_MESSAGE,
  CHAT_VOICE_MESSAGE_MAX_SIZE,
  VOICE_MESSAGE_MAX_DURATION_SECONDS,
  ALLOWED_VOICE_MIME_TYPES,
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
 * Server-issued staging record for one direct-to-Storage upload. The client
 * must call this to learn the object path (it never builds paths itself), and
 * the resulting chat_upload_staging row binds the object to the caller's own
 * member/family. finalizeChatMessage re-checks that binding for every staged
 * path, so a member can never finalize an object staged by someone else — the
 * path is not a capability (authorization never depends on guessing a UUID).
 */
export async function createUploadStaging(
  fileName: string,
): Promise<ActionResult<{ path: string; fileName: string }>> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "chat.send")) {
    return { ok: false, error: "You don't have permission to send messages." };
  }

  const parsed = z.string().trim().min(1).max(255).safeParse(fileName);
  if (!parsed.success) {
    return { ok: false, error: "Invalid file name." };
  }
  const safeName = sanitizeFileName(parsed.data) || "file";
  const draftId = crypto.randomUUID();
  const path = `${access.familyId}/chat/${draftId}/${safeName}`;

  await prisma.chatUploadStaging.create({
    data: {
      familyId: access.familyId,
      memberId: access.memberId,
      storagePath: path,
    },
  });

  return { ok: true, data: { path, fileName: safeName } };
}

/** Rejects any path that doesn't belong to the caller's own family/chat prefix. */
function assertOwnedPath(path: string, familyId: string) {
  const expectedPrefix = `${familyId}/chat/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new Error("Attachment path does not belong to this family.");
  }
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

  try {
    for (const path of allPaths) assertOwnedPath(path, access.familyId);
  } catch (err) {
    await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
    return { ok: false, error: err instanceof Error ? err.message : "Invalid attachment." };
  }

  // --- Ownership: every staged object must be bound to the caller ---
  const staged = await prisma.chatUploadStaging.findMany({
    where: { storagePath: { in: allPaths }, status: "STAGED" },
    select: { storagePath: true, memberId: true, familyId: true },
  });
  const ownPaths = new Set(
    staged
      .filter((s) => s.memberId === access.memberId && s.familyId === access.familyId)
      .map((s) => s.storagePath),
  );
  for (const path of allPaths) {
    if (!ownPaths.has(path)) {
      await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
      return {
        ok: false,
        error: "Attachment wasn't staged by you — upload through the chat composer.",
      };
    }
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
    if (!ALLOWED_VOICE_MIME_TYPES.includes(result.mimeType as (typeof ALLOWED_VOICE_MIME_TYPES)[number])) {
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
            fileName: sanitizeFileName(item.fileName),
            mimeType: item.mimeType,
            size: item.size,
            category: item.category,
          },
        });
        await tx.messageAttachment.create({
          data: { messageId: message.id, blobId: blob.id, caption: item.caption },
        });
      }

      return message;
    });

    const fresh = await getFamilyMessage(created.id, access.memberId);
    // The staged bindings have served their purpose — finalization succeeded,
    // so the uploads are now owned by the sent message.
    await prisma.chatUploadStaging
      .deleteMany({ where: { storagePath: { in: allPaths } } })
      .catch(() => undefined);
    return fresh
      ? { ok: true, data: fresh }
      : { ok: false, error: "Message sent." };
  } catch {
    await deleteUploadedObjects(STORAGE_BUCKET, allPaths);
    return { ok: false, error: "Couldn't send that message. Please try again." };
  }
}
