-- Famora — Realtime chat fixes (migration 0008)
-- ==============================================
-- Two live-update bugs reported after the chat slice landed:
--
-- 1. Soft-deleting a message did not appear in Realtime until a manual
--    refresh. `messages_select_participant` (0001) required
--    `"deletedAt" is null`, so once a message was soft-deleted the updated
--    row failed the subscriber's SELECT policy and Postgres Changes withheld
--    the UPDATE event entirely. Relaxing the policy to keep participants
--    readable for soft-deleted rows restores the event. Readers already see
--    removed messages through the app (the projection blanks the body), so
--    this does not widen what a participant can see.
--
-- 2. Removing a reaction (or unpinning) did not update the other viewers
--    until a refresh. `message_reactions`/`pinned_messages` used the
--    default (PK-only) replica identity, so DELETE events that a client
--    receives carry only the child row's id — not the `messageId` needed to
--    refetch the affected message. Replica Identity FULL makes the full
--    (deleted) row available in the DELETE payload.

-- ---------------------------------------------------------------------------
-- 1. Keep soft-deleted messages deliverable (and readable) for participants.
-- ---------------------------------------------------------------------------

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages
  for select using (
    exists (
      select 1
      from public.conversation_members cm
      join public.family_members fm on fm.id = cm."memberId"
      where cm."conversationId" = public.messages."conversationId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Full replica identity on side-effect tables (DELETEs carry messageId).
-- ---------------------------------------------------------------------------

alter table public.message_reactions replica identity full;
alter table public.pinned_messages replica identity full;