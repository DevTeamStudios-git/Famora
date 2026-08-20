"use client";

import * as React from "react";
import { VOICE_MESSAGE_MAX_DURATION_SECONDS } from "@/lib/validation/attachments";

// Preference order — the browser is asked for the first one it supports.
// Deliberately not hardcoded to a single codec (Safari doesn't support
// audio/webm at all; Chrome/Firefox don't support audio/mp4 recording).
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export type VoiceRecorderState =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "recorded"
  | "unsupported"
  | "permission-denied";

const WAVEFORM_LENGTH = 24;

export function useVoiceRecorder() {
  // Client-only capability check via useSyncExternalStore so SSR and the first
  // client render agree (both use getServerSnapshot => "supported"), avoiding a
  // hydration mismatch when `typeof MediaRecorder` differs between server and
  // browser. Users without a supported recorder drop to "unsupported" right
  // after hydration (and again on a mic click in start()).
  const isSupported = React.useSyncExternalStore<boolean>(
    () => () => {},
    () => typeof MediaRecorder !== "undefined" && pickSupportedMimeType() !== null,
    () => true,
  );
  const [state, setState] = React.useState<VoiceRecorderState>("idle");
  if (!isSupported && state !== "unsupported") {
    setState("unsupported");
  }
  const [durationMs, setDurationMs] = React.useState(0);
  // Rolling amplitude history (0-1 each) for a lightweight live waveform.
  // Owned here (not derived in the UI component) since accumulating a
  // sliding window from a per-frame sample isn't a pure render-time
  // derivation — it needs the previous window.
  const [waveform, setWaveform] = React.useState<number[]>(() =>
    Array(WAVEFORM_LENGTH).fill(0.15),
  );
  const [result, setResult] = React.useState<{ blob: Blob; durationMs: number } | null>(null);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const startedAtRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const mimeTypeRef = React.useRef<string>("audio/webm");

  function stopTracksAndAnalyser() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  async function start() {
    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setState("unsupported");
      return;
    }
    mimeTypeRef.current = mimeType;
    setState("requesting-permission");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("permission-denied");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    setWaveform(Array(WAVEFORM_LENGTH).fill(0.15));

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      setResult({ blob, durationMs: Date.now() - startedAtRef.current });
      setState("recorded");
      stopTracksAndAnalyser();
    };
    mediaRecorderRef.current = recorder;

    // Live amplitude for a lightweight waveform indicator.
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioContextCtor();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += Math.abs(v - 128);
        const amplitude = Math.min(1, sum / data.length / 40);
        setWaveform((prev) => [...prev.slice(1), Math.max(0.15, amplitude)]);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Amplitude visualization is cosmetic — recording still works without it.
    }

    startedAtRef.current = Date.now();
    recorder.start();
    setState("recording");
  }

  // Duration ticker + hard stop at the max allowed length.
  React.useEffect(() => {
    if (state !== "recording") return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setDurationMs(elapsed);
      if (elapsed >= VOICE_MESSAGE_MAX_DURATION_SECONDS * 1000) {
        mediaRecorderRef.current?.stop();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [state]);

  function stop() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function discard() {
    stop();
    stopTracksAndAnalyser();
    setResult(null);
    setDurationMs(0);
    setState("idle");
  }

  // Never keep the microphone open past recording, and always release it if
  // the component unmounts (e.g. navigating away mid-recording).
  React.useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stopTracksAndAnalyser();
    };
  }, []);

  return {
    state,
    durationMs,
    waveform,
    result,
    start: () => void start(),
    stop,
    discard,
  };
}
