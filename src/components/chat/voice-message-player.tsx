"use client";

import * as React from "react";
import { Play, Pause } from "lucide-react";

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VoiceMessagePlayer({
  url,
  durationMs,
}: {
  url: string | null;
  durationMs: number | null;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0); // 0-1
  const [currentMs, setCurrentMs] = React.useState(0);

  if (!url) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        Voice message unavailable (link expired — try reopening the chat).
      </p>
    );
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play();
  }

  return (
    <div className="mt-1 flex w-56 items-center gap-2 rounded-full border border-border bg-muted/40 px-2 py-1.5">
      <button
        type="button"
        onClick={toggle}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
        <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        {formatDuration(currentMs || durationMs || 0)}
      </span>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setCurrentMs(0);
        }}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget;
          setCurrentMs(audio.currentTime * 1000);
          if (audio.duration && Number.isFinite(audio.duration)) {
            setProgress(audio.currentTime / audio.duration);
          }
        }}
        className="hidden"
      />
    </div>
  );
}
