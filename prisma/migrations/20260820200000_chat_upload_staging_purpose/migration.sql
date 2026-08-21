-- Add purpose column to chat_upload_staging
-- ===========================================
-- Adds an explicit purpose (ATTACHMENT vs VOICE) so the server can enforce
-- that voice-message uploads come through the dedicated voice path, not by
-- repurposing an attachment staging slot.

CREATE TYPE chat_upload_purpose AS ENUM ('ATTACHMENT', 'VOICE');

ALTER TABLE "chat_upload_staging" ADD COLUMN "purpose" chat_upload_purpose NOT NULL DEFAULT 'ATTACHMENT';