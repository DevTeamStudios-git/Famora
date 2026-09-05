-- 20260826120001_agenda_permissions.sql — Granular agenda permissions [spec §3]
-- Extends 0002_seed_permissions.sql with the finer keys the vertical slice needs.
-- Keeps the coarse agenda.read/create/update/delete/manage keys for backwards compat.

insert into public.permissions (key, "group", description) values
  ('agenda.view',                        'Agenda', 'View the family agenda'),
  ('agenda.event.create',                'Agenda', 'Create events on accessible calendars'),
  ('agenda.event.update.own',            'Agenda', 'Edit events you created'),
  ('agenda.event.update.any',            'Agenda', 'Edit any family event'),
  ('agenda.event.delete.own',            'Agenda', 'Delete events you created'),
  ('agenda.event.delete.any',            'Agenda', 'Delete any family event'),
  ('agenda.event.rsvp',                  'Agenda', 'Respond to invitations'),
  ('agenda.event.comment',               'Agenda', 'Comment on events'),
  ('agenda.calendar.create.personal',    'Agenda', 'Create your own personal calendars'),
  ('agenda.calendar.create.family',      'Agenda', 'Create family calendars'),
  ('agenda.calendar.manage',             'Agenda', 'Rename / recolour / archive family calendars'),
  ('agenda.calendar.permissions',        'Agenda', 'Change who can access family calendars')
on conflict (key) do update set "group" = excluded."group", description = excluded.description;

-- Extend role matrix (idempotent)
with role_sets(role, permissions) as (
  values
    (
      'MEMBER'::internal_role,
      array[
        'agenda.view','agenda.event.create','agenda.event.update.own','agenda.event.delete.own',
        'agenda.event.rsvp','agenda.event.comment','agenda.calendar.create.personal'
      ]::text[]
    ),
    (
      'CO_FAMILY_CHIEF'::internal_role,
      array[
        'agenda.view','agenda.event.create','agenda.event.update.own','agenda.event.update.any',
        'agenda.event.delete.own','agenda.event.delete.any','agenda.event.rsvp','agenda.event.comment',
        'agenda.calendar.create.personal','agenda.calendar.manage'
      ]::text[]
    ),
    (
      'FAMILY_CHIEF'::internal_role,
      array[
        'agenda.view','agenda.event.create','agenda.event.update.own','agenda.event.update.any',
        'agenda.event.delete.own','agenda.event.delete.any','agenda.event.rsvp','agenda.event.comment',
        'agenda.calendar.create.personal','agenda.calendar.create.family','agenda.calendar.manage','agenda.calendar.permissions'
      ]::text[]
    ),
    (
      'HIDDEN_ADMIN'::internal_role,
      array[
        'agenda.view','agenda.event.create','agenda.event.update.own','agenda.event.update.any',
        'agenda.event.delete.own','agenda.event.delete.any','agenda.event.rsvp','agenda.event.comment',
        'agenda.calendar.create.personal','agenda.calendar.create.family','agenda.calendar.manage','agenda.calendar.permissions'
      ]::text[]
    )
)
insert into public.role_permissions (id, role, permission)
select gen_random_uuid(), rs.role, p
from role_sets rs
cross join lateral unnest(rs.permissions) as p
on conflict (role, permission) do nothing;

-- Ensure calendar tables are in realtime publication (idempotent)
do $$ begin alter publication supabase_realtime add table public.calendars; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.calendar_preferences; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.calendar_events; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.calendar_event_participants; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.calendar_event_comments; exception when duplicate_object then null; end $$;
