"use client";

import * as React from "react";
import { Send, X, CornerUpLeft, Smile, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/server/queries/chat";

type MessageComposerProps = {
  disabled?: boolean;
  disabledReason?: string;
  replyingTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (body: string) => Promise<void> | void;
  onTypingChange?: (isTyping: boolean) => void;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return ctor ? new ctor() : null;
}

export function MessageComposer({
  disabled,
  disabledReason,
  replyingTo,
  onCancelReply,
  onSend,
  onTypingChange,
}: MessageComposerProps) {
  const [value, setValue] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [dictating, setDictating] = React.useState(false);
  const [dictationSupported, setDictationSupported] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = React.useRef("");
  const baseRef = React.useRef("");

  const isTyping = value.trim().length > 0 && !sending && !disabled;

  React.useEffect(() => {
    queueMicrotask(() => {
      setDictationSupported(getSpeechRecognition() !== null);
    });
  }, []);

  React.useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  React.useEffect(() => {
    onTypingChange?.(isTyping);
  }, [isTyping, onTypingChange]);

  React.useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  async function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;
    stopDictation();
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

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      const cursor = start + emoji.length;
      el?.setSelectionRange(cursor, cursor);
    });
  }

  function startDictation() {
    const recognition = getSpeechRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;
    baseRef.current = value;
    transcriptRef.current = "";
    recognition.continuous = true;
    recognition.interimResults = true;
    if (typeof navigator !== "undefined" && navigator.language) {
      recognition.lang = navigator.language;
    }
    recognition.onresult = (event) => {
      let interim = "";
      let finalDelta = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalDelta += transcript + " ";
        else interim = transcript;
      }
      transcriptRef.current += finalDelta;
      const committed = transcriptRef.current.trim();
      let next = baseRef.current.trimEnd();
      if (committed) next += " " + committed;
      if (interim) next = next.trimEnd() + " " + interim.trimEnd();
      setValue(next);
    };
    recognition.onerror = () => {
      recognition.abort();
    };
    recognition.onend = () => {
      setDictating(false);
      textareaRef.current?.focus();
    };
    setDictating(true);
    try {
      recognition.start();
    } catch {
      // Already started or unsupported in this browser/context.
      setDictating(false);
    }
  }

  function stopDictation() {
    recognitionRef.current?.stop();
    setDictating(false);
  }

  const actionsDisabled = Boolean(disabled || sending);

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
          onBlur={() => onTypingChange?.(false)}
          placeholder="Message the family…"
          disabled={disabled || sending}
          rows={1}
          className={cn(
            "max-h-40 min-h-9 flex-1 resize-none py-2",
          )}
        />
        <div className="flex shrink-0 items-end gap-0.5">
          <EmojiPicker
            align="end"
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                disabled={actionsDisabled}
                aria-label="Insert emoji"
              >
                <Smile className="h-4 w-4" aria-hidden />
              </Button>
            }
            onSelect={insertEmoji}
          />
          {dictationSupported ? (
            <Button
              type="button"
              variant={dictating ? "secondary" : "ghost"}
              size="iconSm"
              disabled={actionsDisabled}
              onClick={() => (dictating ? stopDictation() : startDictation())}
              aria-label={dictating ? "Stop voice input" : "Start voice input"}
            >
              {dictating ? (
                <Square className="h-4 w-4" aria-hidden />
              ) : (
                <Mic className="h-4 w-4" aria-hidden />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            disabled={actionsDisabled || !value.trim()}
            loading={sending}
            onClick={() => void handleSend()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">
        {dictating
          ? "Listening… tap the stop button when you're done"
          : "Enter to send · Shift + Enter for a new line"}
      </p>
    </div>
  );
}