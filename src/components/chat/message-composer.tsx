"use client";

import * as React from "react";
import { Send, X, CornerUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/server/queries/chat";

type MessageComposerProps = {
  disabled?: boolean;
  disabledReason?: string;
  replyingTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (body: string) => Promise<void> | void;
};

export function MessageComposer({
  disabled,
  disabledReason,
  replyingTo,
  onCancelReply,
  onSend,
}: MessageComposerProps) {
  const [value, setValue] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  async function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="border-t border-border bg-card p-3">
      {replyingTo ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <CornerUpLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              Replying to{" "}
              <span className="font-medium text-foreground">
                {replyingTo.sender?.displayName ?? "a deleted member"}
              </span>
              {": "}
              {replyingTo.body || "(message removed)"}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="shrink-0 rounded-full p-1 hover:bg-accent"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {disabled ? (
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          {disabledReason ?? "You can't send messages here."}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the family…"
          disabled={disabled || sending}
          rows={1}
          className={cn(
            "max-h-40 min-h-9 flex-1 resize-none py-2",
          )}
        />
        <Button
          type="button"
          size="icon"
          disabled={disabled || sending || !value.trim()}
          loading={sending}
          onClick={() => void handleSend()}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}
