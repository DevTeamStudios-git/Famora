"use client";

import * as React from "react";
import { FileText, Download } from "lucide-react";
import type { ChatAttachment } from "@/server/queries/chat";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({ attachments }: { attachments: ChatAttachment[] }) {
  if (attachments.length === 0) return null;

  const media = attachments.filter((a) => a.category === "IMAGE" || a.category === "VIDEO");
  const files = attachments.filter((a) => a.category !== "IMAGE" && a.category !== "VIDEO");

  return (
    <div className="mt-1 space-y-1.5">
      {media.length > 0 ? (
        <div className="grid max-w-sm grid-cols-2 gap-1.5">
          {media.map((a) =>
            a.url === null ? (
              <div
                key={a.id}
                className="flex aspect-square items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground"
              >
                Unavailable
              </div>
            ) : a.category === "IMAGE" ? (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-lg bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring Supabase Storage URL, not a static asset */}
                <img src={a.url} alt={a.caption ?? a.fileName} className="h-full w-full object-cover" />
              </a>
            ) : (
              <video
                key={a.id}
                src={a.url}
                controls
                className="aspect-square rounded-lg bg-black object-cover"
              />
            ),
          )}
        </div>
      ) : null}

      {files.map((a) => (
        <a
          key={a.id}
          href={a.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="flex max-w-xs items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 hover:bg-muted"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{a.fileName}</p>
            <p className="text-[11px] text-muted-foreground">{formatSize(a.size)}</p>
          </div>
          {a.url ? <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
        </a>
      ))}

      {attachments.some((a) => a.caption) ? (
        <p className="text-sm">{attachments.find((a) => a.caption)?.caption}</p>
      ) : null}
    </div>
  );
}
