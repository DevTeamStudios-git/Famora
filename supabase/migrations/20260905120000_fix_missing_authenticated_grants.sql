-- Fix missing GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated` on tables
-- that have RLS enabled and matching policies, but were never granted the
-- base table-level privilege PostgREST/Realtime requires before RLS policies
-- are even evaluated.
--
-- Each grant here is scoped to exactly the privilege(s) implied by that
-- table's existing RLS policy commands (verified via pg_policies grouped by
-- cmd before writing this file). Tables with RLS enabled but zero policies
-- are deliberately left out: RLS + no policy = deny-all regardless of table
-- grants, so granting there would be harmless but is not necessary to
-- unblock anything, and doesn't match the "grant only what a policy already
-- calls for" convention established in earlier migrations (0004, 0006).

grant insert, update on public.messages to authenticated;
grant update on public.family_members to authenticated;

grant select on public.activity_events to authenticated;
grant select, insert on public.announcements to authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert, update on public.calendar_events to authenticated;
grant select, update on public.families to authenticated;
grant select, insert on public.family_contacts to authenticated;
grant select, update on public.family_features to authenticated;
grant select, insert, delete on public.family_grants to authenticated;
grant select, insert, update, delete on public.family_member_settings to authenticated;
grant select, update on public.family_settings to authenticated;
grant select, insert, delete on public.family_whitelist to authenticated;
grant select, insert on public.memories to authenticated;
grant select on public.notebook_pages to authenticated;
grant select on public.notifications to authenticated;
grant select on public.permissions to authenticated;
grant select, insert, update on public.polls to authenticated;
grant select, insert on public.recipes to authenticated;
grant select on public.role_permissions to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert, update, delete on public.user_devices to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, update on public.users to authenticated;
