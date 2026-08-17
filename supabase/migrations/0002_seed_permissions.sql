-- Famora — Permissions & default role seed (migration 0002)
-- ============================================================
-- Idempotent mirror of src/lib/authorization/permissions.ts. The TypeScript
-- registry is the source of truth for application behavior; this SQL keeps the
-- database usable for RLS/audit/inspection. Runs any time (ON CONFLICT rules).
-- """
-- Apply AFTER 0001 (needs enums + tables from Prisma).

insert into public.permissions (key, "group", description) values
  ('family.read',                 'Family',         'Read family information'),
  ('family.update',               'Family',         'Edit family settings'),
  ('family.delete',               'Family',         'Delete / close the family'),
  ('family.transfer_ownership',   'Family',         'Transfer Family Chief ownership'),
  ('family.export',               'Family',         'Export family data'),
  ('members.read',                'Members',        'View family members'),
  ('members.invite',              'Members',        'Invite members'),
  ('members.remove',              'Members',        'Remove members'),
  ('members.disable',             'Members',        'Disable member access'),
  ('members.change_role',         'Members',        'Change member roles'),
  ('members.manage',              'Members',        'Operational member management'),
  ('whitelist.read',              'Whitelist',      'View family whitelist'),
  ('whitelist.add',               'Whitelist',      'Add whitelist entries'),
  ('whitelist.remove',            'Whitelist',      'Remove whitelist entries'),
  ('whitelist.disable',           'Whitelist',      'Disable whitelist entries'),
  ('chat.read',                   'Chat',           'Read family chat'),
  ('chat.send',                   'Chat',           'Send messages'),
  ('chat.edit_own',               'Chat',           'Edit own messages'),
  ('chat.react',                  'Chat',           'React to messages'),
  ('chat.poll_create',            'Chat',           'Create polls'),
  ('chat.moderate',               'Chat',           'Moderate the family chat'),
  ('chat.delete_any_message',     'Chat',           'Delete any message'),
  ('chat.pin_any_message',        'Chat',           'Pin/unpin any message'),
  ('dms.read',                    'DMs',            'Read direct messages'),
  ('dms.send',                    'DMs',            'Send direct messages'),
  ('agenda.read',                 'Agenda',         'View the family agenda'),
  ('agenda.create',               'Agenda',         'Create events'),
  ('agenda.update',               'Agenda',         'Edit events'),
  ('agenda.delete',               'Agenda',         'Delete events'),
  ('agenda.manage',               'Agenda',         'Administrate the agenda'),
  ('tasks.read',                  'Tasks',          'View family tasks'),
  ('tasks.create',                'Tasks',          'Create tasks'),
  ('tasks.update',                'Tasks',          'Update tasks'),
  ('tasks.delete',                'Tasks',          'Delete tasks'),
  ('tasks.assign',                'Tasks',          'Assign tasks'),
  ('notebook.family_read',        'Notebook',       'Read the family notebook'),
  ('notebook.family_create',      'Notebook',       'Create family notebook pages'),
  ('notebook.family_update',      'Notebook',       'Edit family notebook pages'),
  ('notebook.family_delete',      'Notebook',       'Delete family notebook pages'),
  ('notebook.family_manage',      'Notebook',       'Administrate the family notebook'),
  ('notebook.personal',           'Notebook',       'Full control of own personal notebook'),
  ('files.read',                  'Files',          'Read the family drive'),
  ('files.upload',                'Files',          'Upload files'),
  ('files.download',              'Files',          'Download files'),
  ('files.manage',                'Files',          'Manage family files'),
  ('files.delete',                'Files',          'Delete family files'),
  ('polls.read',                  'Polls',          'View polls'),
  ('polls.create',                'Polls',          'Create polls'),
  ('polls.vote',                  'Polls',          'Vote in polls'),
  ('announcements.read',          'Announcements',  'Read announcements'),
  ('announcements.manage',        'Announcements',  'Create and manage announcements'),
  ('contacts.read',               'Contacts',       'Read family contacts'),
  ('contacts.create',             'Contacts',       'Create contacts'),
  ('contacts.manage',             'Contacts',       'Manage family contacts'),
  ('recipes.read',                'Recipes',        'Read family recipes'),
  ('recipes.create',              'Recipes',        'Contribute recipes'),
  ('recipes.manage',              'Recipes',        'Manage family recipes'),
  ('memories.read',               'Memories',       'View family memories'),
  ('memories.create',             'Memories',       'Upload memories'),
  ('memories.manage',             'Memories',       'Manage family memories'),
  ('notifications.read',          'Notifications',  'View notifications'),
  ('notifications.manage_prefs',  'Notifications',  'Manage notification preferences'),
  ('tools.manage',                'Administration', 'Enable/disable family tools'),
  ('audit.read',                  'Administration', 'Read administrative audit logs'),
  ('security.manage',             'Administration', 'Manage security settings'),
  ('security.emergency',          'Administration', 'Use Emergency Security Mode'),
  ('admin_panel.access',          'Administration', 'Access the Admin Panel')
on conflict (key) do update
  set "group" = excluded."group", description = excluded.description;

-- Default role → permission matrix (mirror of DEFAULT_ROLE_PERMISSIONS).
-- FAMILY_CHIEF and HIDDEN_ADMIN receive the complete permission set.
with role_sets(role, permissions) as (
  values
    (
      'MEMBER'::internal_role,
      array[
        'family.read','members.read','chat.read','chat.send','chat.edit_own',
        'chat.react','chat.poll_create','dms.read','dms.send',
        'agenda.read','agenda.create','agenda.update','agenda.delete',
        'tasks.read','tasks.create','tasks.update',
        'notebook.family_read','notebook.family_create','notebook.family_update',
        'notebook.personal',
        'files.read','files.upload','files.download',
        'polls.read','polls.create','polls.vote',
        'announcements.read',
        'contacts.read','contacts.create',
        'recipes.read','recipes.create',
        'memories.read','memories.create',
        'notifications.read','notifications.manage_prefs'
      ]::text[]
    ),
    (
      'CO_FAMILY_CHIEF'::internal_role,
      array[
        'family.read','family.update','members.read','members.invite',
        'members.manage',
        'whitelist.read',
        'chat.read','chat.send','chat.edit_own','chat.react','chat.poll_create',
        'chat.moderate','chat.delete_any_message','chat.pin_any_message',
        'dms.read','dms.send',
        'agenda.read','agenda.create','agenda.update','agenda.delete','agenda.manage',
        'tasks.read','tasks.create','tasks.update','tasks.delete','tasks.assign',
        'notebook.family_read','notebook.family_create','notebook.family_update',
        'notebook.family_delete','notebook.family_manage','notebook.personal',
        'files.read','files.upload','files.download','files.manage','files.delete',
        'polls.read','polls.create','polls.vote',
        'announcements.read','announcements.manage',
        'contacts.read','contacts.create','contacts.manage',
        'recipes.read','recipes.create','recipes.manage',
        'memories.read','memories.create','memories.manage',
        'notifications.read','notifications.manage_prefs',
        'tools.manage','admin_panel.access'
      ]::text[]
    ),
    (
      'FAMILY_CHIEF'::internal_role,
      array[
        'family.read','family.update','family.delete','family.transfer_ownership','family.export',
        'members.read','members.invite','members.remove','members.disable',
        'members.change_role','members.manage',
        'whitelist.read','whitelist.add','whitelist.remove','whitelist.disable',
        'chat.read','chat.send','chat.edit_own','chat.react','chat.poll_create',
        'chat.moderate','chat.delete_any_message','chat.pin_any_message',
        'dms.read','dms.send',
        'agenda.read','agenda.create','agenda.update','agenda.delete','agenda.manage',
        'tasks.read','tasks.create','tasks.update','tasks.delete','tasks.assign',
        'notebook.family_read','notebook.family_create','notebook.family_update',
        'notebook.family_delete','notebook.family_manage','notebook.personal',
        'files.read','files.upload','files.download','files.manage','files.delete',
        'polls.read','polls.create','polls.vote',
        'announcements.read','announcements.manage',
        'contacts.read','contacts.create','contacts.manage',
        'recipes.read','recipes.create','recipes.manage',
        'memories.read','memories.create','memories.manage',
        'notifications.read','notifications.manage_prefs',
        'tools.manage','audit.read','security.manage','security.emergency',
        'admin_panel.access'
      ]::text[]
    ),
    (
      'HIDDEN_ADMIN'::internal_role,
      array[
        'family.read','family.update','family.delete','family.transfer_ownership','family.export',
        'members.read','members.invite','members.remove','members.disable',
        'members.change_role','members.manage',
        'whitelist.read','whitelist.add','whitelist.remove','whitelist.disable',
        'chat.read','chat.send','chat.edit_own','chat.react','chat.poll_create',
        'chat.moderate','chat.delete_any_message','chat.pin_any_message',
        'dms.read','dms.send',
        'agenda.read','agenda.create','agenda.update','agenda.delete','agenda.manage',
        'tasks.read','tasks.create','tasks.update','tasks.delete','tasks.assign',
        'notebook.family_read','notebook.family_create','notebook.family_update',
        'notebook.family_delete','notebook.family_manage','notebook.personal',
        'files.read','files.upload','files.download','files.manage','files.delete',
        'polls.read','polls.create','polls.vote',
        'announcements.read','announcements.manage',
        'contacts.read','contacts.create','contacts.manage',
        'recipes.read','recipes.create','recipes.manage',
        'memories.read','memories.create','memories.manage',
        'notifications.read','notifications.manage_prefs',
        'tools.manage','audit.read','security.manage','security.emergency',
        'admin_panel.access'
      ]::text[]
    )
)
insert into public.role_permissions (id, role, permission)
select gen_random_uuid(), rs.role, p
from role_sets rs
cross join lateral unnest(rs.permissions) as p
on conflict (role, permission) do nothing;

-- Realtime publications for the main streams (idempotent).
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.calendar_events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.activity_events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;