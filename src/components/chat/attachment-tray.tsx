"use client";

import * as React from "react";
import { X, FileText, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StagedAttachment } from "@/components/chat/use-attachment-upload";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentThumb({ attachment }: { attachment: StagedAttachment }) {
  if (attachment.category === "IMAGE" && attachment.previewUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote/optimizable src
    return <img src={attachment.previewUrl} alt="" className="h-full w-full object-cover" />;
  }
  if (attachment.category === "VIDEO" && attachment.previewUrl) {
    return (
      <video src={attachment.previewUrl} className="h-full w-full object-cover" muted playsInline />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <FileText className="h-6 w-6 text-muted-foreground" aria-hidden />
    </div>
  );
}

export function AttachmentTray({
  attachments,
  onRemove,
  onCaptionChange,
}: {
  attachments: StagedAttachment[];
  onRemove: (id: string) => void;
  onCaptionChange: (id: string, caption: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2 rounded-lg border border-border bg-muted/40 p-2">
      {attachments.map((a) => (
        <div
          key={a.id}
          className="relative flex w-32 flex-col overflow-hidden rounded-md border border-border bg-card"
        >
          <div className="relative h-20 w-full shrink-0">
            <AttachmentThumb attachment={a} />
            {a.status === "uploading" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/70">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${a.progress}%` }}
                  />
                </div>
              </div>
            ) : null}
            {a.status === "error" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-foreground shadow-sm hover:bg-background"
              aria-label={`Remove ${a.file.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="p-1.5">
            <p className="truncate text-[11px] font-medium" title={a.file.name}>
              {a.file.name}
            </p>
            {a.status === "error" ? (
              <p className="truncate text-[10px] text-destructive" title={a.error}>
                {a.error}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground">{formatSize(a.file.size)}</p>
            )}
            {a.status === "uploaded" ? (
              <input
                value={a.caption}
                onChange={(e) => onCaptionChange(a.id, e.target.value)}
                placeholder="Add a caption…"
                maxLength={500}
                className={cn(
                  "mt-1 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[10px]",
                  "focus:border-border focus:outline-none",
                )}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
