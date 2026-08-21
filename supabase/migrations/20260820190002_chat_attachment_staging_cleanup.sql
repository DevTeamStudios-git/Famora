-- Famora — Chat attachment staging cleanup (migration 0008)
-- ============================================================
-- The existing "families" bucket policies (0003) only let a
-- FAMILY_CHIEF/CO_FAMILY_CHIEF/HIDDEN_ADMIN delete objects — correct for the
-- shared Family Drive (§14, deletion is a moderated action there), but it
-- means an ordinary member who selects a file, uploads it, then hits
-- "cancel" before sending has no way to remove their own not-yet-sent
-- upload. Requirement from the attachment-work brief: "Cancel must actually
-- clean up."
--
-- This adds a narrow, additional DELETE policy: the uploader (Storage's
-- `owner` column, set automatically to auth.uid() at upload time) may delete
-- their own object under the chat path, but ONLY while it is still
-- unfinalized — i.e. no `file_blobs` row references it yet. Once
-- src/server/actions/attachments.ts finalizes the upload (creates the
-- FileBlob + MessageAttachment rows), this policy stops matching and
-- deletion falls back to the existing chiefs-only policy, consistent with
-- how a sent message's attachments are treated like any other family-shared
-- content.
--
-- Object path convention (§42.14, extending 0003's families/{familyId}/{kind}/{uuid}):
--   families/{familyId}/chat/{draftId}/{fileName}

drop policy if exists "family_chat_uploads_delete_own_unfinalized" on storage.objects;
create policy "family_chat_uploads_delete_own_unfinalized" on storage.objects
  for delete using (
    bucket_id = 'families'
    and (storage.foldername(name))[2] = 'chat'
    and owner = auth.uid()
    and not exists (
      select 1 from public.file_blobs fb
      where fb.bucket = 'families' and fb."storagePath" = name
    )
  );
