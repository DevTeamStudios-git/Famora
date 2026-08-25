import { describe, expect, it } from "vitest";
import {
  categoryForMime,
  isVoiceRecordingMimeType,
  extensionForVoiceMime,
  looksLikePlainText,
} from "@/lib/validation/attachments";

describe("attachment validation", () => {
  describe("isVoiceRecordingMimeType", () => {
    it("accepts the audio MIME types a recorder can output", () => {
      for (const mime of [
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
      ]) {
        expect(isVoiceRecordingMimeType(mime)).toBe(true);
      }
    });

    it("accepts webm/mp4 that sniff to the video variant (file-type's container fallback)", () => {
      // MediaRecorder output is audio-only, but the EBML/ISO-BMFF header has
      // no audio/video flag, so file-type reports the container as video/webm
      // (Chrome/Firefox) or video/mp4 (Safari). Both must be valid voice.
      expect(isVoiceRecordingMimeType("video/webm")).toBe(true);
      expect(isVoiceRecordingMimeType("video/mp4")).toBe(true);
    });

    it("rejects arbitrary video and other MIME types", () => {
      expect(isVoiceRecordingMimeType("video/mp4;codecs=avc1")).toBe(false);
      expect(isVoiceRecordingMimeType("video/quicktime")).toBe(false);
      expect(isVoiceRecordingMimeType("audio/aac")).toBe(false);
      expect(isVoiceRecordingMimeType("audio/x-caf")).toBe(false);
      expect(isVoiceRecordingMimeType("application/pdf")).toBe(false);
      expect(isVoiceRecordingMimeType("")).toBe(false);
    });
  });

  describe("categoryForMime", () => {
    it("accepts the specific OOXML MIME types file-type sniffs for real Office files", () => {
      expect(
        categoryForMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      ).toBe("DOCUMENT");
      expect(
        categoryForMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      ).toBe("DOCUMENT");
    });

    it("rejects generic application/zip (arbitrary archives are not documents)", () => {
      expect(categoryForMime("application/zip")).toBeNull();
    });
  });

  describe("extensionForVoiceMime", () => {
    it("maps recorded container MIME types to an extension", () => {
      expect(extensionForVoiceMime("audio/webm")).toBe("webm");
      expect(extensionForVoiceMime("audio/webm;codecs=opus")).toBe("webm");
      expect(extensionForVoiceMime("audio/mp4")).toBe("m4a");
      expect(extensionForVoiceMime("audio/ogg")).toBe("ogg");
      expect(extensionForVoiceMime("audio/wav")).toBe("wav");
      expect(extensionForVoiceMime("audio/mpeg")).toBe("mp3");
    });
  });

  describe("looksLikePlainText", () => {
    const enc = (s: string) => new TextEncoder().encode(s);

    it("accepts real plain text", () => {
      expect(looksLikePlainText(enc("Grandma's lasagna recipe:\n\n1 lb ground beef\n..."))).toBe(
        true,
      );
    });

    it("accepts an empty buffer", () => {
      expect(looksLikePlainText(new Uint8Array(0))).toBe(true);
    });

    it("accepts text with common whitespace control characters", () => {
      expect(looksLikePlainText(enc("line one\r\nline two\ttabbed"))).toBe(true);
    });

    it("rejects content with a NUL byte (near-certain binary signal)", () => {
      const bytes = enc("looks like text");
      const withNul = new Uint8Array([...bytes, 0, ...bytes]);
      expect(looksLikePlainText(withNul)).toBe(false);
    });

    it("rejects a real binary signature (e.g. a stray/mislabeled ELF header)", () => {
      // 0x7F 'E' 'L' 'F' — an ELF executable's magic bytes, named "*.txt" by
      // an attacker to probe the extension-based fallback this test guards.
      expect(looksLikePlainText(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]))).toBe(
        false,
      );
    });

    it("rejects content with a high density of control bytes", () => {
      const junk = new Uint8Array(200).fill(0x01); // well outside the 1% control-byte tolerance
      expect(looksLikePlainText(junk)).toBe(false);
    });

    it("rejects invalid UTF-8", () => {
      // 0xFF is never valid as a standalone UTF-8 byte.
      expect(looksLikePlainText(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe(false);
    });

    it("tolerates a multi-byte UTF-8 character split at the read-buffer boundary", () => {
      // "café" — the "é" is 2 bytes (0xC3 0xA9). Truncate mid-character, the
      // way sniff.ts's fixed-size read window could split a real file.
      const full = enc("café");
      const truncatedMidCharacter = full.subarray(0, full.length - 1);
      expect(looksLikePlainText(truncatedMidCharacter)).toBe(true);
    });
  });
});