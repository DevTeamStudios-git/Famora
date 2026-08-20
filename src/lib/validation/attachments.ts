// Chat attachment & voice-message limits (§6, §7, §42.20).
//
// Single source of truth for both client-side UX (fast feedback, cancel
// oversized selections before uploading) and server-side validation (the
// actual security boundary — see src/server/actions/attachments.ts). Never
// duplicate these numbers elsewhere.

export const CHAT_MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const CHAT_IMAGE_MAX_SIZE = 15 * 1024 * 1024; // 15 MB
export const CHAT_VIDEO_MAX_SIZE = 200 * 1024 * 1024; // 200 MB
export const CHAT_AUDIO_MAX_SIZE = 25 * 1024 * 1024; // 25 MB (uploaded audio files)
export const CHAT_DOCUMENT_MAX_SIZE = 25 * 1024 * 1024; // 25 MB
export const CHAT_VOICE_MESSAGE_MAX_SIZE = 15 * 1024 * 1024; // 15 MB (recorded voice notes)

/** Hard ceiling across every category — used for the first, cheap check. */
export const CHAT_ATTACHMENT_MAX_SIZE = CHAT_VIDEO_MAX_SIZE;

export const VOICE_MESSAGE_MAX_DURATION_SECONDS = 5 * 60; // 5 minutes

export type AttachmentCategory = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

/**
 * Allowlisted MIME types per category. This is a starting allowlist, not an
 * exhaustive one — deliberately conservative. The server never trusts a
 * client-declared MIME type; it sniffs real magic bytes (see
 * src/lib/storage/sniff.ts) and checks the *sniffed* type against this same
 * table. The client uses it only for pre-upload UX (instant "that file type
 * isn't supported" feedback), which is why both sides import one table.
 */
export const ALLOWED_MIME_TYPES: Record<AttachmentCategory, readonly string[]> = {
  IMAGE: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
  AUDIO: ["audio/mpeg", "audio/wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/aac"],
  DOCUMENT: [
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Deliberately no generic "application/zip": PDF/Office/plain-text are the
    // supported documents. Real .docx/.xlsx/.pptx are OOXML ZIP containers and
    // file-type's magic-byte sniffer inspects the archive internals to return
    // the specific OOXML types above — accepting generic application/zip here
    // would let an arbitrary archive masquerade as a "document".
  ],
} as const;

/** Voice *recordings* specifically — a strict subset of AUDIO. */
export const ALLOWED_VOICE_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

/** Picks a reasonable file extension for a recorded voice blob's MIME type. */
export function extensionForVoiceMime(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
    case "audio/wav":
      return "wav";
    case "audio/mpeg":
      return "mp3";
    default:
      return "webm";
  }
}

const SIZE_LIMITS: Record<AttachmentCategory, number> = {
  IMAGE: CHAT_IMAGE_MAX_SIZE,
  VIDEO: CHAT_VIDEO_MAX_SIZE,
  AUDIO: CHAT_AUDIO_MAX_SIZE,
  DOCUMENT: CHAT_DOCUMENT_MAX_SIZE,
};

export function categoryForMime(mimeType: string): AttachmentCategory | null {
  for (const [category, types] of Object.entries(ALLOWED_MIME_TYPES) as [
    AttachmentCategory,
    readonly string[],
  ][]) {
    if (types.includes(mimeType)) return category;
  }
  return null;
}

export function maxSizeForCategory(category: AttachmentCategory): number {
  return SIZE_LIMITS[category];
}

/** Client-side pre-check only — never the security boundary. */
export function quickValidateFile(file: {
  type: string;
  size: number;
}): { ok: true; category: AttachmentCategory } | { ok: false; error: string } {
  const category = categoryForMime(file.type);
  if (!category) {
    return { ok: false, error: `"${file.type || "unknown"}" isn't a supported file type.` };
  }
  const max = maxSizeForCategory(category);
  if (file.size > max) {
    return {
      ok: false,
      error: `That file is too large (max ${Math.round(max / (1024 * 1024))} MB for ${category.toLowerCase()}s).`,
    };
  }
  return { ok: true, category };
}

/**
 * Makes a user-supplied file name safe for a Storage path segment. Shared by
 * the client (path construction is owned by the server action, but the name
 * still flows through the same sanitizer) and the server (createUploadStaging).
 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
}
