-- Famora — initial family seed (supabase db seed)
-- ===============================================
-- Idempotent. Seeds the very first Famora family, its settings, the default
-- feature set, and the hard access whitelist (§40). Apply AFTER migrations.
-- prisma/seed.ts is the equivalent for the Prisma workflow.

-- 1. The family -----------------------------------------------------------------

insert into public.families (id, name, description, timezone)
values (
  '00000000-0000-4000-8000-000000000001',
  'Famora',
  'The Famora family space',
  'UTC'
)
on conflict (id) do nothing;

-- 2. Family settings ------------------------------------------------------------

insert into public.family_settings (id, "familyId", timezone, "defaultLanguage", "dateFormat", "firstDayOfWeek")
values (
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  'UTC',
  'en',
  'dd/MM/yyyy',
  1
)
on conflict ("familyId") do nothing;

-- 3. Default feature flags ------------------------------------------------------

insert into public.family_features (id, "familyId", key, enabled)
select
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  key,
  true
from (values
  ('chat'), ('dms'), ('tasks'), ('notebook'), ('files'), ('polls'),
  ('contacts'), ('recipes'), ('memories'), ('announcements'), ('tools')
) as f(key)
on conflict ("familyId", key) do nothing;

-- 4. Hard access whitelist (§40) -------------------------------------------------

insert into public.family_whitelist (id, "familyId", email, "internalRole", status)
select
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  entry.email,
  entry.role::internal_role,
  'ACTIVE'::whitelist_status
from (values
  ('akouekam@gmail.com',                  'FAMILY_CHIEF'),
  ('alibizza85@gmail.com',                'FAMILY_CHIEF'),
  ('edithyot@gmail.com',                  'CO_FAMILY_CHIEF'),
  ('chainesecondairegabriel@gmail.com',   'HIDDEN_ADMIN'),
  ('gabethan1316@gmail.com',              'HIDDEN_ADMIN'),
  ('estherpriscilekm@gmail.com',          'MEMBER'),
  ('gaya74222@gmail.com',                 'MEMBER'),
  ('michaelkm1406@gmail.com',             'MEMBER'),
  ('michesther6@gmail.com',               'MEMBER')
) as entry(email, role)
on conflict ("familyId", email) do nothing;