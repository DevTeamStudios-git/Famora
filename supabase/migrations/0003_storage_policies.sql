-- Famora — Storage policies (migration 0003)
-- ============================================
-- Buckets:  families/  (family drive + chat attachments)
--            personal/  (personal notebook files)
--            avatars/   (profile pictures)
--
-- Object keys follow the family-aware scheme documented in prisma/schema.prisma:
--   families/{familyId}/{kind}/{uuid}   (members only)
--   users/{userId}/personal-notebook/…  (owner only)
--   users/{userId}/avatar.…             (owner only)
--
-- Policy names must be unique within storage.objects (Supabase requirement).

-- families bucket ------------------------------------------------------------

drop policy if exists "family_files_select_members" on storage.objects;
create policy "family_files_select_members" on storage.objects
  for select using (
    bucket_id = 'families'
    and public.famora_is_active_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "family_files_insert_members" on storage.objects;
create policy "family_files_insert_members" on storage.objects
  for insert with check (
    bucket_id = 'families'
    and public.famora_is_active_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "family_files_update_members" on storage.objects;
create policy "family_files_update_members" on storage.objects
  for update using (
    bucket_id = 'families'
    and public.famora_is_active_member((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'families'
    and public.famora_is_active_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "family_files_delete_chiefs" on storage.objects;
create policy "family_files_delete_chiefs" on storage.objects
  for delete using (
    bucket_id = 'families'
    and public.famora_has_internal_role((storage.foldername(name))[1]::uuid, array['FAMILY_CHIEF','CO_FAMILY_CHIEF','HIDDEN_ADMIN']::internal_role[])
  );

-- personal bucket (owner only) ------------------------------------------------

drop policy if exists "personal_files_owner" on storage.objects;
create policy "personal_files_owner" on storage.objects
  for all using (
    bucket_id = 'personal'
    and owner = auth.uid()
  );

-- avatars bucket (own avatar readable publicly, writable by owner) -------------

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_owner" on storage.objects;
create policy "avatars_insert_owner" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and owner = auth.uid()
  );

drop policy if exists "avatars_update_owner" on storage.objects;
create policy "avatars_update_owner" on storage.objects
  for update using (
    bucket_id = 'avatars' and owner = auth.uid()
  )
  with check (
    bucket_id = 'avatars' and owner = auth.uid()
  );

drop policy if exists "avatars_delete_owner" on storage.objects;
create policy "avatars_delete_owner" on storage.objects
  for delete using (
    bucket_id = 'avatars' and owner = auth.uid()
  );