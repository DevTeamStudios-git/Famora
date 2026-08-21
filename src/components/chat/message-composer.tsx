"use client";

import * as React from "react";
import { Send, X, CornerUpLeft, Paperclip, Smile, Mic, Square, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { AttachmentTray } from "@/components/chat/attachment-tray";
import { VoiceRecorderButton } from "@/components/chat/voice-recorder";
import {
  useAttachmentUpload,
  getUploadAccessToken,
  uploadWithProgress,
} from "@/components/chat/use-attachment-upload";
import { createUploadStaging, cancelUploadStaging } from "@/server/actions/attachments";
import { extensionForVoiceMime } from "@/lib/validation/attachments";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/server/queries/chat";
import { toast } from "sonner";

export type ComposerSendPayload = {
  body: string;
  attachments: { path: string; fileName: string; caption?: string }[];
  voice: { path: string; fileName: string; durationMs: number } | null;
};

type MessageComposerProps = {
  disabled?: boolean;
  disabledReason?: string;
  replyingTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (payload: ComposerSendPayload) => Promise<void> | void;
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

const DICTATION_ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. Please allow microphone access to use voice typing.",
  "no-speech": "No speech was detected. Please try speaking closer to the microphone.",
  "audio-capture": "Microphone unavailable. Please check your microphone is connected and not in use.",
  "network": "Speech recognition service is unreachable. Please check your connection.",
  "aborted": "Voice typing was cancelled.",
  "service-not-allowed": "Speech recognition isn't available right now. Please try again later.",
  "bad-grammar": "Speech recognition grammar error. Please try again.",
  "language-not-supported": "The selected language isn't supported for voice typing.",
};

const MAX_RECOGNITION_RESTARTS = 1;

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
  const [dictationError, setDictationError] = React.useState<string | null>(null);
  const [showDictationPrivacy, setShowDictationPrivacy] = React.useState(false);
  const [dictationLang, setDictationLang] = React.useState<string>("en-US");
  const [recognitionRestarts, setRecognitionRestarts] = React.useState(0);
  const [userStoppedDictation, setUserStoppedDictation] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [hasShownPrivacyNotice, setHasShownPrivacyNotice] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = React.useRef("");
  const baseRef = React.useRef("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dragCounter = React.useRef(0);

  const upload = useAttachmentUpload();

  const isTyping = value.trim().length > 0 && !sending && !disabled;

  React.useEffect(() => {
    queueMicrotask(() => {
      setDictationSupported(getSpeechRecognition() !== null);
    });
  }, []);

  // Initialize dictation language on client side (SSR-safe)
  React.useEffect(() => {
    queueMicrotask(() => {
      if (typeof navigator !== "undefined" && navigator.language) {
        setDictationLang(navigator.language);
      }
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
    if (sending || disabled) return;
    if (upload.isUploading) {
      toast.error("Wait for attachments to finish uploading.");
      return;
    }
    if (!trimmed && upload.readyToSend.length === 0) return;
    stopDictation();
    setSending(true);
    try {
      await onSend({
        body: trimmed,
        attachments: upload.readyToSend.map((a) => ({
          path: a.path,
          fileName: a.file.name,
          caption: a.caption || undefined,
        })),
        voice: null,
      });
      setValue("");
      upload.reset();
    } catch {
      // onSend throws on failure — keep attachments/voice for retry
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  async function handleSendVoice(blob: Blob, durationMs: number) {
    const accessToken = await getUploadAccessToken();
    if (!accessToken) {
      toast.error("You need to be signed in to send a voice message.");
      return;
    }
    const fileName = `voice-message.${extensionForVoiceMime(blob.type)}`;
    const staging = await createUploadStaging(fileName, "VOICE");
    if (!staging.ok) {
      toast.error(staging.error);
      return;
    }
    const path = staging.data.path;

    try {
      await uploadWithProgress({ path, file: blob, accessToken, onProgress: () => {} }).promise;
    } catch {
      toast.error("Couldn't upload the voice message. Please try again.");
      void cancelUploadStaging(path);
      return;
    }

    setSending(true);
    try {
      await onSend({
        body: "",
        attachments: [],
        voice: { path, fileName, durationMs },
      });
    } catch {
      // onSend throws on failure — keep voice recording for retry
    } finally {
      setSending(false);
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
    // "auto" means use the browser's current locale
    recognition.lang = dictationLang === "auto" ? (navigator?.language ?? "en-US") : dictationLang;
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
    recognition.onerror = (event) => {
      const errorMsg = DICTATION_ERROR_MESSAGES[event.error] ?? "Voice typing encountered an error. Please try again.";
      setDictationError(errorMsg);
      recognition.abort();
      setDictating(false);
      setUserStoppedDictation(false);
      setRecognitionRestarts(0);
    };
    recognition.onend = () => {
      if (userStoppedDictation) {
        // User explicitly stopped — clean shutdown
        setDictating(false);
        setUserStoppedDictation(false);
        setRecognitionRestarts(0);
        textareaRef.current?.focus();
        return;
      }
      // Browser ended recognition unexpectedly — restart once if under limit
      if (recognitionRestarts < MAX_RECOGNITION_RESTARTS) {
        setRecognitionRestarts((r) => r + 1);
        try {
          recognition.start();
        } catch {
          setDictating(false);
          setRecognitionRestarts(0);
          textareaRef.current?.focus();
        }
      } else {
        setDictating(false);
        setRecognitionRestarts(0);
        textareaRef.current?.focus();
      }
    };
    setDictating(true);
    setDictationError(null);
    setUserStoppedDictation(false);
    // First-use privacy notice
    if (!hasShownPrivacyNotice) {
      setShowDictationPrivacy(true);
      setHasShownPrivacyNotice(true);
    }
    try {
      recognition.start();
    } catch {
      // Already started or unsupported in this browser/context.
      setDictating(false);
    }
  }

  function stopDictation() {
    setUserStoppedDictation(true);
    recognitionRef.current?.stop();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      void upload.addFiles(files);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) void upload.addFiles(e.dataTransfer.files);
  }

  const actionsDisabled = Boolean(disabled || sending);
  const showSend = Boolean(value.trim() || upload.readyToSend.length > 0);

  return (
    <div
      className={cn("relative border-t border-border bg-card p-3", dragActive && "bg-accent/30")}
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current += 1;
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) setDragActive(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {dragActive ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium text-primary">
          Drop to attach
        </div>
      ) : null}

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

{/* Dictation error banner */}
          {dictationError && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{dictationError}</span>
              <button
                type="button"
                onClick={() => setDictationError(null)}
                className="ml-auto shrink-0 rounded p-0.5 hover:bg-destructive/20 text-destructive/70"
                aria-label="Dismiss error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {showDictationPrivacy && (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-muted/50 border border-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
              <span>
                Voice typing uses your browser&apos;s speech recognition service. Audio processing
                may be handled by your browser/provider.
              </span>
              <button
                type="button"
                onClick={() => setShowDictationPrivacy(false)}
                className="ml-auto shrink-0 rounded p-0.5 hover:bg-muted"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <AttachmentTray
            attachments={upload.attachments}
            onRemove={upload.removeAttachment}
            onCaptionChange={upload.updateCaption}
          />

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void upload.addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={actionsDisabled}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach a file"
              title="Attach a file"
            >
              <Paperclip className="h-4 w-4" aria-hidden />
            </Button>
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={() => onTypingChange?.(false)}
              placeholder="Message the family…"
              disabled={disabled || sending || dictating}
              rows={1}
              className={cn(
                "max-h-40 min-h-9 flex-1 resize-none py-2",
                dictating && "bg-muted/50"
              )}
            />
            <div className="flex shrink-0 items-end gap-0.5">
              {dictationSupported ? (
                <div className="flex items-center gap-1">
                  <select
                    value={dictationLang}
                    onChange={(e) => {
                      setDictationLang(e.target.value);
                    }}
                    className="h-7 px-2 py-1 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    disabled={actionsDisabled || dictating}
                    aria-label="Voice typing language"
                  >
                    <option value="auto">Automatic</option>
                    <option value="en-US">English (US)</option>
                    <option value="en-CA">English (Canada)</option>
                    <option value="fr-CA">Français (Canada)</option>
                    <option value="es-ES">Español (España)</option>
                    <option value="es-MX">Español (México)</option>
                    <option value="de-DE">Deutsch</option>
                    <option value="it-IT">Italiano</option>
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="ja-JP">日本語</option>
                    <option value="ko-KR">한국어</option>
                    <option value="zh-CN">中文 (简体)</option>
                    <option value="zh-TW">中文 (繁體)</option>
                  </select>
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
                </div>
              ) : null}
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
          {showSend ? (
            <Button
              type="button"
              size="icon"
              disabled={actionsDisabled || upload.isUploading}
              loading={sending}
              onClick={() => void handleSend()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <VoiceRecorderButton disabled={actionsDisabled} onSend={handleSendVoice} />
          )}
        </div>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">
        {dictating
          ? "Listening… editing is paused while dictating"
          : "Enter to send · Shift + Enter for a new line"}
      </p>
    </div>
  );
}