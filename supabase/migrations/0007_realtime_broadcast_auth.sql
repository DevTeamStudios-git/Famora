-- Famora — Realtime Broadcast authorization (migration 0007)
-- ============================================================
-- The family chat channel (`family:{familyId}:chat`, see
-- src/lib/realtime/channels.ts) carries *both* postgres_changes (message
-- events — authorized by each source table's RLS) and a `broadcast` channel
-- used for typing indicators (ephemeral, authored entirely by the client).
-- Broadcast and Presence bypass table RLS: without authorization gates, any
-- authenticated Supabase user who learns a familyId could subscribe to the
-- channel and receive live typing events (conversationId + member displayName),
-- or publish spoofed ones. This contradicts the guarantee in channels.ts that
-- "channels must be private and authorized by RLS".
--
-- Fix, per Supabase Realtime Authorization: the client marks the channel
-- `private`, and RLS policies on `realtime.messages` decide who may join a
-- topic (SELECT = receive broadcast; INSERT = send broadcast). `auth.uid()` is
-- the subscriber's JWT; `realtime.topic()` is the channel name they joined.
--
-- While here, `authenticated` gets SELECT on `conversations`. Migration 0006
-- added policies that reference `public.conversations` (moderator soft-delete,
-- pin/unpin) but 0004 only granted SELECT on messages / conversation_members /
-- family_members — RLS policy evaluation runs as the invoking role, so without
-- this grant those policies would raise "permission denied" for the RLS-aware
-- path. The participant-scoped `conversations_select_members` policy already
-- exists; this just unlocks it.

-- ---------------------------------------------------------------------------
-- Backfill: SELECT on conversations for the RLS-aware path.
-- ---------------------------------------------------------------------------

grant select on public.conversations to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime Broadcast: only ACTIVE members of the family may join (receive)
-- or send typing events on their family's chat topic.
-- ---------------------------------------------------------------------------

drop policy if exists "family_chat_broadcast_receive" on realtime.messages;
create policy "family_chat_broadcast_receive"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast')
    and realtime.topic() ~ '^family:[0-9a-fA-F-]{36}:chat$'
    and exists (
      select 1
      from public.family_members fm
      where fm."familyId" = split_part(realtime.topic(), ':', 2)::uuid
        and fm."userId" = auth.uid()
        and fm.status = 'ACTIVE'
    )
  );

drop policy if exists "family_chat_broadcast_send" on realtime.messages;
create policy "family_chat_broadcast_send"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension in ('broadcast')
    and realtime.topic() ~ '^family:[0-9a-fA-F-]{36}:chat$'
    and exists (
      select 1
      from public.family_members fm
      where fm."familyId" = split_part(realtime.topic(), ':', 2)::uuid
        and fm."userId" = auth.uid()
        and fm.status = 'ACTIVE'
    )
  );