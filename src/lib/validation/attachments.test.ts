import { describe, expect, it } from "vitest";
import {
  categoryForMime,
  isVoiceRecordingMimeType,
  extensionForVoiceMime,
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
});