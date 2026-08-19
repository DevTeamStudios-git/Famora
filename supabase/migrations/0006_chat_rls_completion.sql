-- Famora — Chat RLS completion (migration 0006)
-- ============================================
-- 0001 enabled RLS on every chat table but left several without any policy
-- (RLS-enabled + zero policies = default-deny, not a security hole by
-- itself, but the app relies on Prisma's direct/service connection, which
-- bypasses RLS entirely — so the RLS-aware (anon/authenticated) path was
-- simply unusable for these tables). 0004/0005 already closed the gap for
-- `messages`, `message_reactions` (select), and `pinned_messages` (select).
-- This migration closes what's left:
--
--   1. `messages` had no moderator UPDATE policy — "messages_update_author"
--      (0001) only ever matched the message's own sender. A Chief/Co-Chief/
--      Hidden Admin soft-deleting someone else's message (chat.delete_any_
--      message) currently only works because src/server/actions/chat.ts
--      writes through Prisma's direct connection, which is not subject to
--      RLS. Confirmed there is no policy filling this: 0001 line 335 left an
--      orphaned `drop policy if exists "messages_moderate_members" on
--      message_reactions` with a comment ("mirror of below") pointing at a
--      policy that was never written.
--   2. message_reactions / pinned_messages: INSERT/DELETE (0005 only added
--      SELECT).
--   3. message_edits, message_attachments, message_read_states,
--      saved_messages: no policies at all yet.
--
-- Role buckets mirror the *default* grants in
-- src/lib/authorization/permissions.ts; per-family FamilyGrant overrides
-- (e.g. a Parent stripped of chat.delete_any_message) are enforced by the
-- app layer only, consistent with every other admin policy in
-- 0001_enable_rls.sql making the same trade-off.

-- ---------------------------------------------------------------------------
-- messages: moderator soft-delete
-- ---------------------------------------------------------------------------

drop policy if exists "messages_moderate_update" on public.messages;
create policy "messages_moderate_update" on public.messages
  for update using (
    exists (
      select 1
      from public.conversations conv
      where conv.id = public.messages."conversationId"
        and public.famora_has_internal_role(
          conv."familyId",
          array['FAMILY_CHIEF','CO_FAMILY_CHIEF','HIDDEN_ADMIN']::internal_role[]
        )
    )
  )
  with check (
    exists (
      select 1
      from public.conversations conv
      where conv.id = public.messages."conversationId"
        and public.famora_has_internal_role(
          conv."familyId",
          array['FAMILY_CHIEF','CO_FAMILY_CHIEF','HIDDEN_ADMIN']::internal_role[]
        )
    )
  );

-- ---------------------------------------------------------------------------
-- message_reactions: a member may add/remove only their own reaction.
-- ---------------------------------------------------------------------------

drop policy if exists "message_reactions_insert_own" on public.message_reactions;
create policy "message_reactions_insert_own" on public.message_reactions
  for insert with check (
    exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm."conversationId" = m."conversationId"
      join public.family_members fm on fm.id = cm."memberId"
      where m.id = public.message_reactions."messageId"
        and fm.id = public.message_reactions."memberId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

drop policy if exists "message_reactions_delete_own" on public.message_reactions;
create policy "message_reactions_delete_own" on public.message_reactions
  for delete using (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.message_reactions."memberId"
        and fm."userId" = public.famora_auth_uid()
    )
  );

-- ---------------------------------------------------------------------------
-- pinned_messages: pin/unpin requires the same moderator bucket as message
-- deletion (chat.pin_any_message's default grant).
-- ---------------------------------------------------------------------------

drop policy if exists "pinned_messages_insert_moderate" on public.pinned_messages;
create policy "pinned_messages_insert_moderate" on public.pinned_messages
  for insert with check (
    exists (
      select 1
      from public.messages m
      join public.conversations conv on conv.id = m."conversationId"
      where m.id = public.pinned_messages."messageId"
        and public.famora_has_internal_role(
          conv."familyId",
          array['FAMILY_CHIEF','CO_FAMILY_CHIEF','HIDDEN_ADMIN']::internal_role[]
        )
    )
  );

drop policy if exists "pinned_messages_delete_moderate" on public.pinned_messages;
create policy "pinned_messages_delete_moderate" on public.pinned_messages
  for delete using (
    exists (
      select 1
      from public.messages m
      join public.conversations conv on conv.id = m."conversationId"
      where m.id = public.pinned_messages."messageId"
        and public.famora_has_internal_role(
          conv."familyId",
          array['FAMILY_CHIEF','CO_FAMILY_CHIEF','HIDDEN_ADMIN']::internal_role[]
        )
    )
  );

-- ---------------------------------------------------------------------------
-- saved_messages: strictly private to the saving member (§9 "Save message"
-- is a personal bookmark, not a shared artifact).
-- ---------------------------------------------------------------------------

drop policy if exists "saved_messages_select_own" on public.saved_messages;
create policy "saved_messages_select_own" on public.saved_messages
  for select using (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.saved_messages."memberId"
        and fm."userId" = public.famora_auth_uid()
    )
  );

drop policy if exists "saved_messages_insert_own" on public.saved_messages;
create policy "saved_messages_insert_own" on public.saved_messages
  for insert with check (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.saved_messages."memberId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

drop policy if exists "saved_messages_delete_own" on public.saved_messages;
create policy "saved_messages_delete_own" on public.saved_messages
  for delete using (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.saved_messages."memberId"
        and fm."userId" = public.famora_auth_uid()
    )
  );

-- ---------------------------------------------------------------------------
-- message_edits: append-only history (§41 point 11). Conversation
-- participants may read it (to power a future "view edit history" UI); no
-- insert/update/delete policy is added on purpose — the RLS-aware client
-- path stays permanently read-only, edits are recorded exclusively by the
-- server action alongside the message update.
-- ---------------------------------------------------------------------------

drop policy if exists "message_edits_select_participant" on public.message_edits;
create policy "message_edits_select_participant" on public.message_edits
  for select using (
    exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm."conversationId" = m."conversationId"
      join public.family_members fm on fm.id = cm."memberId"
      where m.id = public.message_edits."messageId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

-- ---------------------------------------------------------------------------
-- message_attachments: readable by conversation participants; only the
-- message's own sender may attach a file to it. Not wired up in the app yet
-- (§6/§7 attachments are a follow-up), but the policy floor should exist
-- before the upload path is built, not after.
-- ---------------------------------------------------------------------------

drop policy if exists "message_attachments_select_participant" on public.message_attachments;
create policy "message_attachments_select_participant" on public.message_attachments
  for select using (
    exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm."conversationId" = m."conversationId"
      join public.family_members fm on fm.id = cm."memberId"
      where m.id = public.message_attachments."messageId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

drop policy if exists "message_attachments_insert_sender" on public.message_attachments;
create policy "message_attachments_insert_sender" on public.message_attachments
  for insert with check (
    exists (
      select 1
      from public.messages m
      join public.family_members fm on fm.id = m."senderMemberId"
      where m.id = public.message_attachments."messageId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

-- ---------------------------------------------------------------------------
-- message_read_states: "seen by" receipts. Any participant may read all
-- receipts in their conversation; a member may only write their own.
-- ---------------------------------------------------------------------------

drop policy if exists "message_read_states_select_participant" on public.message_read_states;
create policy "message_read_states_select_participant" on public.message_read_states
  for select using (
    exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm."conversationId" = m."conversationId"
      join public.family_members fm on fm.id = cm."memberId"
      where m.id = public.message_read_states."messageId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

drop policy if exists "message_read_states_upsert_own" on public.message_read_states;
create policy "message_read_states_upsert_own" on public.message_read_states
  for insert with check (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.message_read_states."memberId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

drop policy if exists "message_read_states_update_own" on public.message_read_states;
create policy "message_read_states_update_own" on public.message_read_states
  for update using (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.message_read_states."memberId"
        and fm."userId" = public.famora_auth_uid()
    )
  )
  with check (
    exists (
      select 1 from public.family_members fm
      where fm.id = public.message_read_states."memberId"
        and fm."userId" = public.famora_auth_uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants: the tables touched above need the same baseline SELECT grant that
-- 0004/0005 already gave `messages`/`message_reactions`/`pinned_messages`,
-- or RLS policies never even get evaluated for the `authenticated` role.
-- ---------------------------------------------------------------------------

grant select on public.saved_messages to authenticated;
grant select on public.message_edits to authenticated;
grant select on public.message_attachments to authenticated;
grant select on public.message_read_states to authenticated;
grant insert, delete on public.message_reactions to authenticated;
grant insert, delete on public.pinned_messages to authenticated;
grant insert on public.saved_messages to authenticated;
grant delete on public.saved_messages to authenticated;
grant insert, update on public.message_read_states to authenticated;
grant insert on public.message_attachments to authenticated;
