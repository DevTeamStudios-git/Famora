import "server-only";

import { fileTypeFromBuffer } from "file-type";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Bytes needed for file-type's magic-number detection across every format
// we allow (video containers need the most — MP4/WebM headers can be a few
// KB in). Generous but still tiny compared to any real attachment.
const SNIFF_BYTES = 4100;

export type StoredObjectInfo = {
  /** The real, storage-reported byte size — NOT the client's declared size. */
  size: number;
  exists: true;
};

/**
 * Looks up an uploaded object's real size directly from Storage. Storage's
 * recorded size reflects actual bytes received, so — unlike the recorded
 * `mimetype` (which is just whatever Content-Type header the uploader sent)
 * — this number is not client-spoofable and is safe to use as the security
 * boundary for size limits.
 */
export async function statUploadedObject(
  bucket: string,
  path: string,
): Promise<StoredObjectInfo | null> {
  const admin = getSupabaseAdminClient();
  const slash = path.lastIndexOf("/");
  const folder = slash === -1 ? "" : path.slice(0, slash);
  const fileName = slash === -1 ? path : path.slice(slash + 1);

  const { data, error } = await admin.storage
    .from(bucket)
    .list(folder, { search: fileName, limit: 1 });

  if (error || !data || data.length === 0) return null;
  const object = data.find((f) => f.name === fileName);
  if (!object?.metadata) return null;

  return { size: object.metadata.size, exists: true };
}

/**
 * Downloads just enough of an uploaded object to sniff its *real* content
 * type from magic bytes — never trusts the client-declared MIME type or the
 * Content-Type Storage happens to have recorded (that's also just an echo of
 * what the uploader's browser claimed at upload time, not something Storage
 * independently verifies).
 *
 * Simplification worth knowing: we ask for a byte range via a plain `fetch`
 * against a short-lived signed URL (the storage-js SDK's `download()` has no
 * way to attach a Range header). If the storage backend doesn't honor Range
 * and returns the full object instead, we still only feed the first
 * SNIFF_BYTES to the sniffer — correct, just not bandwidth-optimal for a
 * very large file that ignores Range. Not worth a bespoke streaming client
 * for what's already a size-capped upload.
 */
export async function sniffUploadedMimeType(
  bucket: string,
  path: string,
): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, 60);
  if (signError || !signed?.signedUrl) return null;

  const response = await fetch(signed.signedUrl, {
    headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
  });
  if (!response.ok && response.status !== 206) return null;

  const buffer = new Uint8Array(await response.arrayBuffer()).slice(0, SNIFF_BYTES);
  const result = await fileTypeFromBuffer(buffer);
  if (result?.mime) return result.mime;

  // file-type doesn't detect text files (no magic bytes). Fall back to
  // extension-based detection for known text types we allow.
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "txt") return "text/plain";
  return null;
}

/** Best-effort delete — used for cleanup after failed/rejected uploads. */
export async function deleteUploadedObjects(
  bucket: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const admin = getSupabaseAdminClient();
  await admin.storage.from(bucket).remove(paths);
}
