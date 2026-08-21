-- Famora — chat_upload_staging RLS (migration 0009)
-- ============================================================
-- New table (prisma/migrations/20260820190000_chat_upload_staging) binding
-- a staged chat upload to the member who created it — see
-- server/actions/attachments.ts (finalizeChatMessage) for why: a
-- syntactically-valid, family-scoped Storage path isn't proof the caller is
-- the one who uploaded it, so finalization now checks this table instead of
-- trusting the path alone.
--
-- This migration matters beyond just this one table. 0004_realtime_rls_grants.sql
-- added a schema-wide `alter default privileges ... grant select on tables to
-- authenticated`, which (if Prisma's migration role is `postgres`, as is
-- typical for a Supabase direct connection) means any brand-new table
-- already has SELECT granted to `authenticated` from the moment it's
-- created — RLS is what has to close it, not the grant. This is exactly the
-- fail-open risk flagged in 0006's commit message: a table created after
-- 0004 that nobody remembers to enable RLS on is fully readable by any
-- authenticated user, cross-family, by default. Enabling RLS here isn't
-- optional cleanup, it's the only thing standing between this table and
-- that outcome.

alter table public.chat_upload_staging enable row level security;

drop policy if exists "chat_upload_staging_select_own" on public.chat_upload_staging;
create policy "chat_upload_staging_select_own" on public.chat_upload_staging
  for select using (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.chat_upload_staging."memberId"
        and fm."userId" = public.famora_auth_uid()
    )
  );

drop policy if exists "chat_upload_staging_insert_own" on public.chat_upload_staging;
create policy "chat_upload_staging_insert_own" on public.chat_upload_staging
  for insert with check (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.chat_upload_staging."memberId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
        and fm."familyId" = public.chat_upload_staging."familyId"
    )
  );

drop policy if exists "chat_upload_staging_delete_own" on public.chat_upload_staging;
create policy "chat_upload_staging_delete_own" on public.chat_upload_staging
  for delete using (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.chat_upload_staging."memberId"
        and fm."userId" = public.famora_auth_uid()
    )
  );

-- No update policy: staging rows are created once and deleted once
-- (finalized or cancelled), never mutated.

grant select, insert, delete on public.chat_upload_staging to authenticated;