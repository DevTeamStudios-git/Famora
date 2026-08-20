"use client";

import * as React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import {
  quickValidateFile,
  CHAT_MAX_ATTACHMENTS_PER_MESSAGE,
  type AttachmentCategory,
} from "@/lib/validation/attachments";
import {
  createUploadStaging,
  cancelUploadStaging,
} from "@/server/actions/attachments";

export type StagedAttachment = {
  id: string;
  file: File;
  category: AttachmentCategory;
  status: "uploading" | "uploaded" | "error";
  progress: number; // 0-100
  error?: string;
  path: string;
  previewUrl?: string;
  caption: string;
};

const STORAGE_BUCKET = "families";

/** Resolves the current session's access token, needed for the raw XHR upload. */
export async function getUploadAccessToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Uploads directly to Supabase Storage's REST endpoint via XMLHttpRequest
 * instead of the SDK's fetch-based upload() — this is the only way to get
 * real upload progress events and a genuine abort() for cancel. Endpoint and
 * headers verified against the installed @supabase/storage-js source
 * (StorageFileApi.uploadOrUpdate), not guessed.
 */
export function uploadWithProgress(params: {
  path: string;
  file: File | Blob;
  accessToken: string;
  onProgress: (percent: number) => void;
}): { promise: Promise<void>; xhr: XMLHttpRequest } {
  const { path, file, accessToken, onProgress } = params;
  const xhr = new XMLHttpRequest();
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.onabort = () => reject(new Error("canceled"));
    xhr.send(file);
  });

  return { promise, xhr };
}

export function useAttachmentUpload() {
  const [attachments, setAttachments] = React.useState<StagedAttachment[]>([]);
  const xhrsRef = React.useRef<Map<string, XMLHttpRequest>>(new Map());

  function update(id: string, patch: Partial<StagedAttachment>) {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const room = CHAT_MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    if (room <= 0) return;

    const accessToken = await getUploadAccessToken();
    if (!accessToken) return;

    for (const file of list.slice(0, room)) {
      const check = quickValidateFile(file);
      const id = crypto.randomUUID();

      if (!check.ok) {
        setAttachments((prev) => [
          ...prev,
          {
            id,
            file,
            category: "DOCUMENT",
            status: "error",
            progress: 0,
            error: check.error,
            path: "",
            caption: "",
          },
        ]);
        continue;
      }

      // Ask the server to mint the path and bind it to this member — this is
      // the ownership record finalizeChatMessage() checks against later, so
      // authorization doesn't rest on the path itself being hard to guess.
      const staging = await createUploadStaging(file.name);
      if (!staging.ok) {
        setAttachments((prev) => [
          ...prev,
          {
            id,
            file,
            category: check.category,
            status: "error",
            progress: 0,
            error: staging.error,
            path: "",
            caption: "",
          },
        ]);
        continue;
      }
      const path = staging.data.path;
      const previewUrl =
        check.category === "IMAGE" || check.category === "VIDEO"
          ? URL.createObjectURL(file)
          : undefined;

      setAttachments((prev) => [
        ...prev,
        {
          id,
          file,
          category: check.category,
          status: "uploading",
          progress: 0,
          path,
          previewUrl,
          caption: "",
        },
      ]);

      const { promise, xhr } = uploadWithProgress({
        path,
        file,
        accessToken,
        onProgress: (percent) => update(id, { progress: percent }),
      });
      xhrsRef.current.set(id, xhr);

      promise
        .then(() => update(id, { status: "uploaded", progress: 100 }))
        .catch((err: Error) => {
          if (err.message !== "canceled") {
            update(id, { status: "error", error: err.message });
          } else {
            void cancelUploadStaging(path);
          }
        })
        .finally(() => xhrsRef.current.delete(id));
    }
  }

  function removeAttachment(id: string) {
    const xhr = xhrsRef.current.get(id);
    if (xhr) xhr.abort();

    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      if (target?.path) {
        // Best-effort cleanup, fire-and-forget: drop the ownership record and
        // the Storage object itself. Storage RLS (0008) only allows the
        // object delete while unfinalized, matching the staging row's
        // lifetime, so both fail closed together rather than leaving one
        // without the other.
        void cancelUploadStaging(target.path);
        if (target.status === "uploaded") {
          void getSupabaseBrowserClient().storage.from(STORAGE_BUCKET).remove([target.path]);
        }
      }
      return prev.filter((a) => a.id !== id);
    });
  }

  function updateCaption(id: string, caption: string) {
    update(id, { caption });
  }

  function reset() {
    for (const xhr of xhrsRef.current.values()) xhr.abort();
    xhrsRef.current.clear();
    setAttachments((prev) => {
      for (const a of prev) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return [];
    });
  }

  // Abort any in-flight uploads if the component unmounts (e.g. navigating
  // away) without an explicit send or cancel.
  React.useEffect(() => {
    const xhrs = xhrsRef.current;
    return () => {
      for (const xhr of xhrs.values()) xhr.abort();
    };
  }, []);

  const readyToSend = attachments.filter((a) => a.status === "uploaded");
  const isUploading = attachments.some((a) => a.status === "uploading");

  return { attachments, addFiles, removeAttachment, updateCaption, reset, readyToSend, isUploading };
}
