-- 20260826120000_agenda_calendar_rls.sql — Agenda calendar floor [spec §33, §43.30]
-- Reuses helpers from 0001_enable_rls.sql + 20260826011318_move_famora_helpers_to_private_schema:
-- private.famora_auth_uid(), private.famora_is_active_member(), private.famora_has_internal_role()
-- Assumes tables calendars, calendar_preferences, calendar_events (extended), calendar_event_* already exist via Prisma.
-- This migration also tightens role_permissions_select per §43.30 (was qual=true, leaked HIDDEN_ADMIN).

-- Helper: can the caller see this calendar? Enforces §6 privacy boundary.
-- Lives in private alongside the other 5 helpers closed in 20260826011318 — not public (PostgREST RPC).
create or replace function private.famora_can_read_calendar(p_calendar_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.calendars c
    where c.id = p_calendar_id
      and private.famora_is_active_member(c."familyId")
      and (c."ownerId" is null or c."ownerId" = (
        select fm.id from public.family_members fm
        where fm."userId" = private.famora_auth_uid()
          and fm."familyId" = c."familyId"
          and fm.status = 'ACTIVE'
        limit 1
      ))
  )
$$;

create or replace function private.famora_can_manage_agenda(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select private.famora_has_internal_role(p_family_id, array['FAMILY_CHIEF','CO_FAMILY_CHIEF','HIDDEN_ADMIN']::internal_role[])
$$;

-- ---------------------------------------------------------------- calendars
alter table public.calendars enable row level security;

create policy calendars_select on public.calendars for select
  using (private.famora_can_read_calendar(id));

create policy calendars_insert on public.calendars for insert
  with check (
    private.famora_is_active_member("familyId")
    and (
      ("ownerId" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = "familyId" and fm.status = 'ACTIVE' limit 1) and kind = 'PERSONAL')
      or (private.famora_can_manage_agenda("familyId") and "ownerId" is null)
    )
  );

create policy calendars_update on public.calendars for update
  using (
    "ownerId" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = "familyId" and fm.status = 'ACTIVE' limit 1)
    or private.famora_can_manage_agenda("familyId")
  )
  with check (
    "ownerId" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = "familyId" and fm.status = 'ACTIVE' limit 1)
    or private.famora_can_manage_agenda("familyId")
  );

create policy calendars_delete on public.calendars for delete
  using (
    "isSystem" = false
    and (
      "ownerId" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = "familyId" and fm.status = 'ACTIVE' limit 1)
      or private.famora_can_manage_agenda("familyId")
    )
  );

-- ------------------------------------------------------- calendar_preferences
alter table public.calendar_preferences enable row level security;

create policy calendar_prefs_all on public.calendar_preferences for all
  using (
    "memberId" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = (select c."familyId" from public.calendars c where c.id = "calendarId") and fm.status = 'ACTIVE' limit 1)
    and private.famora_can_read_calendar("calendarId")
  )
  with check (
    "memberId" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = (select c."familyId" from public.calendars c where c.id = "calendarId") and fm.status = 'ACTIVE' limit 1)
    and private.famora_can_read_calendar("calendarId")
  );

-- ----------------------------------------------------------- calendar_events (extended)
-- Existing policies calendar_events_select_members etc. from 0001 already allow family members to read.
-- We tighten: require calendar visibility as well, and keep soft-delete hidden.
drop policy if exists calendar_events_select_members on public.calendar_events;
create policy calendar_events_select on public.calendar_events for select
  using (
    private.famora_can_read_calendar("calendarId")
    and "deletedAt" is null
  );

drop policy if exists calendar_events_insert_members on public.calendar_events;
create policy calendar_events_insert on public.calendar_events for insert
  with check (
    private.famora_can_read_calendar("calendarId")
    and "createdById" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = "familyId" and fm.status = 'ACTIVE' limit 1)
  );

-- Legacy compat: checks both createdById (new) and createdByMemberId (old) via OR — old column will be deprecated after backfill. Intentional.
create policy calendar_events_update on public.calendar_events for update
  using (
    private.famora_can_read_calendar("calendarId")
    and (
      "createdById" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = "familyId" and fm.status = 'ACTIVE' limit 1)
      or private.famora_can_manage_agenda("familyId")
      or "createdByMemberId" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = "familyId" and fm.status = 'ACTIVE' limit 1)
    )
  )
  with check (private.famora_can_read_calendar("calendarId"));

create policy calendar_events_delete on public.calendar_events for delete
  using (
    private.famora_can_read_calendar("calendarId")
    and (
      "createdById" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = "familyId" and fm.status = 'ACTIVE' limit 1)
      or private.famora_can_manage_agenda("familyId")
      or "createdByMemberId" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = "familyId" and fm.status = 'ACTIVE' limit 1)
    )
  );

-- ----------------------------------------------------- participants / RSVP
alter table public.calendar_event_participants enable row level security;

create policy participants_select on public.calendar_event_participants for select
  using (private.famora_can_read_calendar((select e."calendarId" from public.calendar_events e where e.id = "eventId")));

create policy participants_insert on public.calendar_event_participants for insert
  with check (exists (
    select 1 from public.calendar_events e
    where e.id = "eventId"
      and private.famora_can_read_calendar(e."calendarId")
  ));

create policy participants_update on public.calendar_event_participants for update
  using (
    "memberId" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = (select e."familyId" from public.calendar_events e where e.id = "eventId") and fm.status = 'ACTIVE' limit 1)
    or exists (
      select 1 from public.calendar_events e
      where e.id = "eventId"
        and (e."createdById" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = e."familyId" and fm.status = 'ACTIVE' limit 1) or private.famora_can_manage_agenda(e."familyId"))
    )
  )
  with check (true);

create policy participants_delete on public.calendar_event_participants for delete
  using (exists (
    select 1 from public.calendar_events e
    where e.id = "eventId"
      and (e."createdById" = (select fm.id from public.family_members fm where fm."userId" = private.famora_auth_uid() and fm."familyId" = e."familyId" and fm.status = 'ACTIVE' limit 1) or private.famora_can_manage_agenda(e."familyId"))
  ));

-- ------------------------- reminders / attachments / comments / checklist
do $$
declare t text;
begin
  foreach t in array array[
    'calendar_event_reminders',
    'calendar_event_attachments',
    'calendar_event_comments',
    'calendar_event_checklist_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_select on public.%1$I for select
        using (private.famora_can_read_calendar((select e."calendarId" from public.calendar_events e where e.id = "eventId")))
    $f$, t);
    execute format($f$
      create policy %1$s_write on public.%1$I for all
        using (private.famora_can_read_calendar((select e."calendarId" from public.calendar_events e where e.id = "eventId")))
        with check (private.famora_can_read_calendar((select e."calendarId" from public.calendar_events e where e.id = "eventId")))
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- role_permissions lockdown per §43.30
-- Was: qual=true (any anon/authenticated could SELECT all rows including role='HIDDEN_ADMIN').
-- Now: caller only sees rows for roles they actually hold. No membership → empty set (role IN (empty) = false, never NULL=NULL).
-- permissions (key/group/description, no role column) stays qual=true — nothing Hidden-Admin-shaped there.
drop policy if exists "role_permissions_select" on public.role_permissions;
create policy "role_permissions_select" on public.role_permissions
  for select using (
    role in (
      select fm."internalRole" from public.family_members fm
      where fm."userId" = private.famora_auth_uid()
        and fm.status = 'ACTIVE'
    )
  );

-- Realtime needs full row images for DELETE payloads
alter table public.calendars replica identity full;
alter table public.calendar_events replica identity full;
alter table public.calendar_event_participants replica identity full;
