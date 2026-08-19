-- Realtime RLS grants.
-- Supabase Realtime authorizes postgres_changes subscribers by running the
-- table's SELECT policies as the `authenticated` role with the subscriber's
-- JWT claims. The Famora tables were created by Prisma (owner: postgres) with
-- no grants, so `authenticated` could not SELECT the tables the policies
-- reference (conversation_members, family_members) and every realtime event
-- was rejected with "Error 401: Unauthorized".
--
-- These GRANTs only unlock row-level access; RLS policies still gate which
-- rows a subscriber may see. The app itself never queries through `authenticated`.

grant usage on schema public to authenticated, anon;

grant select on public.conversation_members to authenticated;
grant select on public.family_members to authenticated;
grant select on public.messages to authenticated;

-- Future tables created by the Prisma connection get the same SELECT grant.
alter default privileges for role postgres in schema public
  grant select on tables to authenticated;

-- Also cover tables created by the Supabase dashboard/other roles so new
-- tables created any way are readable by RLS policies as `authenticated`.
alter default privileges in schema public
  grant select on tables to authenticated;