-- Famora — Chat upload staging RLS (migration 0009)
-- =====================================================
-- chat_upload_staging binds a direct-to-Storage chat object to the member and
-- family that staged it (created by createUploadStaging(), verified by
-- finalizeChatMessage(), deleted on send). 0004's `alter default privileges`
-- grants SELECT on every future table to `authenticated`, so without explicit
-- RLS this table would be readable cross-family (fail-open). These policies
-- keep it strictly personal: a member may only see/insert/delete their own
-- active staging rows, and an insert may only claim a membership the user
-- actually holds in that family.
--
-- The table lives under row-level control for the RLS-aware path; the app
-- itself still writes through Prisma's direct/service connection. Ownership
-- of a staged object is protected end-to-end by finalizeChatMessage() re-
-- checking the binding before any FileBlob is created.

alter table public.chat_upload_staging enable row level security;

drop policy if exists "chat_upload_staging_select_own" on public.chat_upload_staging;
create policy "chat_upload_staging_select_own" on public.chat_upload_staging
  for select using (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.chat_upload_staging."memberId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

drop policy if exists "chat_upload_staging_insert_own" on public.chat_upload_staging;
create policy "chat_upload_staging_insert_own" on public.chat_upload_staging
  for insert with check (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.chat_upload_staging."memberId"
        and fm."familyId" = public.chat_upload_staging."familyId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

drop policy if exists "chat_upload_staging_delete_own" on public.chat_upload_staging;
create policy "chat_upload_staging_delete_own" on public.chat_upload_staging
  for delete using (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.chat_upload_staging."memberId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

-- Table-level grants (matching the 0006 convention; default privileges from
-- 0004 already cover SELECT, this adds the two write paths policies allow).
grant select, insert, delete on public.chat_upload_staging to authenticated;