"use client";

import * as React from "react";
import { Mic, Trash2, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/components/chat/use-voice-recorder";
import { VOICE_MESSAGE_MAX_DURATION_SECONDS } from "@/lib/validation/attachments";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VoiceRecorderButton({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (blob: Blob, durationMs: number) => Promise<void> | void;
}) {
  const recorder = useVoiceRecorder();
  const [sending, setSending] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!recorder.result) {
      queueMicrotask(() => setPreviewUrl(null));
      return;
    }
    const url = URL.createObjectURL(recorder.result.blob);
    queueMicrotask(() => setPreviewUrl(url));
    return () => URL.revokeObjectURL(url);
  }, [recorder.result]);

  if (recorder.state === "unsupported") return null;

  if (recorder.state === "idle" || recorder.state === "requesting-permission") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || recorder.state === "requesting-permission"}
        onClick={recorder.start}
        aria-label="Record a voice message"
        title="Record a voice message"
      >
        <Mic className="h-4 w-4" aria-hidden />
      </Button>
    );
  }

  if (recorder.state === "permission-denied") {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Microphone access was denied — allow it in your browser settings to record.
      </p>
    );
  }

  if (recorder.state === "recording") {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden />
        <span className="w-10 shrink-0 font-mono text-xs tabular-nums">
          {formatDuration(recorder.durationMs)}
        </span>
        <div className="flex h-6 flex-1 items-center gap-px" aria-hidden>
          {recorder.waveform.map((v, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-primary/70"
              style={{ height: `${Math.max(8, v * 100)}%` }}
            />
          ))}
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          max {Math.floor(VOICE_MESSAGE_MAX_DURATION_SECONDS / 60)}:00
        </span>
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          onClick={recorder.discard}
          aria-label="Discard recording"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="iconSm"
          onClick={recorder.stop}
          aria-label="Stop recording"
        >
          <Square className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    );
  }

  // recorded — preview + send/discard
  return (
    <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      {previewUrl ? <audio controls src={previewUrl} className="h-8 flex-1" /> : null}
      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {formatDuration(recorder.durationMs)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        onClick={recorder.discard}
        aria-label="Delete recording"
        disabled={sending}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="iconSm"
        loading={sending}
        onClick={async () => {
          if (!recorder.result) return;
          setSending(true);
          try {
            await onSend(recorder.result.blob, recorder.result.durationMs);
            recorder.discard();
          } finally {
            setSending(false);
          }
        }}
        aria-label="Send voice message"
      >
        <Send className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
