-- Realtime for chat side-effects (message reactions, pinned messages).
-- Reactions and pins live in their own tables, so inserting/removing a row
-- does not touch `messages` — a postgres_changes listener on `messages` never
-- fires. Add them to the realtime publication, grant SELECT to `authenticated`
-- (their policies reference messages/conversation_members), and add
-- participant-scoped SELECT policies (RLS would otherwise deny every change).

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.pinned_messages;
exception when duplicate_object then null;
end $$;

grant select on public.message_reactions to authenticated;
grant select on public.pinned_messages to authenticated;

drop policy if exists "message_reactions_select_participant" on public.message_reactions;
create policy "message_reactions_select_participant" on public.message_reactions
  for select using (
    exists (
      select 1 from public.messages m
      join public.conversation_members cm on cm."conversationId" = m."conversationId"
      join public.family_members fm on fm.id = cm."memberId"
      where m.id = public.message_reactions."messageId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

drop policy if exists "pinned_messages_select_participant" on public.pinned_messages;
create policy "pinned_messages_select_participant" on public.pinned_messages
  for select using (
    exists (
      select 1 from public.messages m
      join public.conversation_members cm on cm."conversationId" = m."conversationId"
      join public.family_members fm on fm.id = cm."memberId"
      where m.id = public.pinned_messages."messageId"
        and fm."userId" = public.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );