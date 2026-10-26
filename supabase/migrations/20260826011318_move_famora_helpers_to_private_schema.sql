-- The 5 famora_* RLS helper functions (SECURITY DEFINER) lived in the
-- public schema, which PostgREST exposes as RPC endpoints -- Supabase's own
-- security advisor flagged all 5 as directly callable by anon/authenticated
-- outside of any RLS policy context. Severity is limited (every function
-- resolves the caller's identity via auth.uid(), not a passable argument, so
-- none of them can be used to probe a *different* user's relationships --
-- confirmed by reading every function body before concluding this), but
-- best practice is these internal helpers shouldn't be public RPC surface
-- at all.
--
-- Fix: move them to a `private` schema, which PostgREST does not expose
-- (only `public`/`graphql_public` are exposed by default, and nothing in
-- this project's migrations adds `private` to that list). RLS policies
-- reference functions by OID at CREATE POLICY time, not by re-parsed text,
-- so this alone required touching zero of the 61 policies that call these
-- functions across 34 tables -- verified empirically in a rolled-back
-- transaction before concluding this, not assumed.
--
-- What DID need fixing: the functions' own SQL-language bodies contain
-- literal schema-qualified calls to each other (e.g. famora_is_active_member
-- calls "public.famora_auth_uid()") -- SQL-language function bodies
-- re-resolve such references via search_path/text at each invocation, not
-- via a stored OID reference like policies do. So the 4 functions that call
-- another famora_* function internally are recreated (same OID, in place)
-- with those internal references updated to `private.`.
--
-- Every change here was tested end-to-end beforehand: real RLS-protected
-- reads (family_members, a messages/conversations join, chat_upload_staging)
-- as a real authenticated session, run inside a transaction that was then
-- rolled back, before this migration touched anything live.

create schema if not exists private;
grant usage on schema private to authenticated, anon, service_role;

alter function public.famora_auth_uid() set schema private;
alter function public.famora_is_active_member(uuid) set schema private;
alter function public.famora_has_internal_role(uuid, internal_role[]) set schema private;
alter function public.famora_can_see_member(uuid) set schema private;
alter function public.famora_may_view_hidden_admin(uuid) set schema private;

create or replace function private.famora_is_active_member("pFamilyId" uuid) returns boolean
 language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.family_members fm
    where fm."userId" = private.famora_auth_uid()
      and fm."familyId" = "pFamilyId"
      and fm.status = 'ACTIVE'
  );
$function$;

create or replace function private.famora_has_internal_role("pFamilyId" uuid, "pRoles" internal_role[]) returns boolean
 language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.family_members fm
    where fm."userId" = private.famora_auth_uid()
      and fm."familyId" = "pFamilyId"
      and fm.status = 'ACTIVE'
      and fm."internalRole" = any("pRoles")
  );
$function$;

create or replace function private.famora_can_see_member("pUserId" uuid) returns boolean
 language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.family_members viewer
    where viewer."userId" = private.famora_auth_uid()
      and viewer.status = 'ACTIVE'
      and exists (
        select 1
        from public.family_members target
        where target."userId" = "pUserId"
          and target."familyId" = viewer."familyId"
          and target.status = 'ACTIVE'
      )
  );
$function$;

create or replace function private.famora_may_view_hidden_admin("pFamilyId" uuid) returns boolean
 language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select private.famora_has_internal_role("pFamilyId", array['HIDDEN_ADMIN']::internal_role[]);
$function$;