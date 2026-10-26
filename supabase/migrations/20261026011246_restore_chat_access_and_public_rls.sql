-- Restore the RLS/grant/publication layers absent from the deployed chat schema.
-- Enable RLS before restoring schema access: tables without policies deny all.
create schema if not exists private;
do $$
declare t record; f record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
  -- Earlier installs put these existing identity helpers in public. Move them,
  -- preserving their OIDs and every policy dependency, rather than duplicating
  -- privileged functions in the exposed API schema.
  for f in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('famora_auth_uid','famora_is_active_member','famora_may_view_hidden_admin','famora_has_internal_role','famora_can_see_member')
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private' and p.proname=f.proname and pg_get_function_identity_arguments(p.oid)=f.args) then
      execute format('alter function public.%I(%s) set schema private', f.proname, f.args);
    end if;
  end loop;
end $$;

grant usage on schema public, private to authenticated;
grant select on public.family_members, public.conversation_members, public.conversations,
  public.messages, public.message_reactions, public.pinned_messages to authenticated;
grant select, insert, delete on public.chat_upload_staging to authenticated;

drop policy if exists family_members_select_masked on public.family_members;
create policy family_members_select_masked on public.family_members for select to authenticated using (
  private.famora_is_active_member("familyId")
  and ("internalRole" <> 'HIDDEN_ADMIN' or "userId" = (select auth.uid()))
);

drop policy if exists conversation_members_select_self on public.conversation_members;
create policy conversation_members_select_self on public.conversation_members for select to authenticated using (
  exists (select 1 from public.family_members fm where fm.id = "memberId"
    and fm."userId" = (select auth.uid()) and fm.status = 'ACTIVE')
);

drop policy if exists conversations_select_members on public.conversations;
create policy conversations_select_members on public.conversations for select to authenticated using (
  exists (select 1 from public.conversation_members cm where cm."conversationId" = conversations.id)
);

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant on public.messages for select to authenticated using (
  exists (select 1 from public.conversation_members cm where cm."conversationId" = messages."conversationId")
);

drop policy if exists message_reactions_select_participant on public.message_reactions;
create policy message_reactions_select_participant on public.message_reactions for select to authenticated using (
  exists (select 1 from public.messages m where m.id = message_reactions."messageId")
);
drop policy if exists pinned_messages_select_participant on public.pinned_messages;
create policy pinned_messages_select_participant on public.pinned_messages for select to authenticated using (
  exists (select 1 from public.messages m where m.id = pinned_messages."messageId")
);

drop policy if exists chat_staging_owner_read on public.chat_upload_staging;
create policy chat_staging_owner_read on public.chat_upload_staging for select to authenticated using (
  private.famora_is_active_member("familyId") and exists
    (select 1 from public.family_members fm where fm.id="memberId" and fm."familyId"=chat_upload_staging."familyId" and fm."userId"=(select auth.uid()))
);
drop policy if exists chat_staging_owner_insert on public.chat_upload_staging;
create policy chat_staging_owner_insert on public.chat_upload_staging for insert to authenticated with check (
  private.famora_is_active_member("familyId") and exists
    (select 1 from public.family_members fm where fm.id="memberId" and fm."familyId"=chat_upload_staging."familyId" and fm."userId"=(select auth.uid()))
  and split_part("storagePath", '/', 1)="familyId"::text
);
drop policy if exists chat_staging_owner_delete on public.chat_upload_staging;
create policy chat_staging_owner_delete on public.chat_upload_staging for delete to authenticated using (
  private.famora_is_active_member("familyId") and exists
    (select 1 from public.family_members fm where fm.id="memberId" and fm."familyId"=chat_upload_staging."familyId" and fm."userId"=(select auth.uid()))
);

drop policy if exists family_chat_broadcast_receive on realtime.messages;
create policy family_chat_broadcast_receive on realtime.messages for select to authenticated using (
  extension = 'broadcast' and case when realtime.topic() ~ '^family:[0-9a-fA-F-]{36}:chat$'
    then private.famora_is_active_member(split_part(realtime.topic(), ':', 2)::uuid) else false end
);
drop policy if exists family_chat_broadcast_send on realtime.messages;
create policy family_chat_broadcast_send on realtime.messages for insert to authenticated with check (
  extension = 'broadcast' and case when realtime.topic() ~ '^family:[0-9a-fA-F-]{36}:chat$'
    then private.famora_is_active_member(split_part(realtime.topic(), ':', 2)::uuid) else false end
);

alter table public.messages replica identity full;
alter table public.message_reactions replica identity full;
alter table public.pinned_messages replica identity full;
do $$
declare target_table text;
begin
  foreach target_table in array array['messages','message_reactions','pinned_messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=target_table) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end $$;
