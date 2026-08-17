# Famora

A private family management web app — chat, agenda, tasks, notebooks, files,
contacts, recipes, memories, announcements and more — for one family and the
people they approve. Famora runs on Next.js (App Router), Supabase (Auth,
Realtime, Storage, RLS) and Prisma (type-safe Postgres access).

> **Security posture:** Famora is *whitelist-only*. Nobody can create a
> family or see anything without being on the family access whitelist. The
> Hidden Admin role is completely invisible to every other member — even in
> raw database reads (RLS).

## Stack

- **Next.js 16.3.1** — App Router, Turbopack, React 19, server-first
- **Tailwind CSS v4** — `@import "tailwindcss"` + CSS-first `@theme` tokens
- **Supabase** — Auth (Google OAuth PKCE), Realtime, Storage, Postgres + RLS
- **Prisma 7** — schema-first domain model, generated client, driver adapters
- **pnpm 11.18.0** — pinned via `packageManager`

## Quick start

```bash
pnpm install
cp .env.example .env        # fill in Supabase + DB credentials
pnpm db:generate            # build the Prisma client & types
pnpm db:validate
pnpm db:migrate             # apply schema (Prisma Migrate)
pnpm db:seed                # seed family, whitelist, permissions
pnpm dev
```

Prisma `migrate` creates the tables; then apply the RLS layer and seed:

```bash
# option A — Supabase CLI (recommended, runs migrations in order)
supabase db push
supabase db seed

# option B — direct SQL
psql "$DIRECT_URL" -f supabase/migrations/0001_enable_rls.sql
psql "$DIRECT_URL" -f supabase/migrations/0002_seed_permissions.sql
psql "$DIRECT_URL" -f supabase/migrations/0003_storage_policies.sql
psql "$DIRECT_URL" -f supabase/seed.sql
```

## Scripts

| script | purpose |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js lifecycle |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` / `pnpm test:e2e` | Vitest unit + Playwright smoke |
| `pnpm db:generate` / `db:validate` / `db:migrate` / `db:seed` | Prisma workflow |

## Security model

Authorization is **data-driven**. There are no hardcoded email checks in
application code: the whitelist lives in the database
(`family_whitelist`) + the seed registry
(`src/lib/authorization/whitelist.ts`), and every decision goes through
`hasPermission`. Two enforcement layers exist and both must agree:

1. **Application layer** — `src/lib/authorization/*`, checked in layouts,
   pages and every server action.
2. **Database floor (RLS)** — `supabase/migrations/0001_enable_rls.sql`
   provides least-privilege policies keyed on *active membership in the same
   family* plus role gates for sensitive tables.

### Roles

- **Family Chief** — full manager set (whitelist, security, members, transfer…)
- **Co-Family Chief** — operational admin (chat moderation, agenda.manage…) but
  **not** sensitive/destructive defaults; extra grants via `FamilyGrant` rows
- **Member** — family content access
- **Hidden Admin** — same full set as Family Chief for enforcement, but
  **projects as a Member everywhere**. The word "Hidden Admin" may only ever
  appear on the role holder's own **Settings → My Role & Permissions** page.

### Hidden Admin invariants [`§43.16–§43.24`]

- Internal role is `HIDDEN_ADMIN`; display role is always `MEMBER`
  (`getDisplayRole`).
- Family-facing API responses use `toPublicMember`, which never includes
  `internalRole`.
- RLS masks `family_members` / `family_whitelist` rows with
  `internalRole = 'HIDDEN_ADMIN'` from every non-hidden viewer.
- Read/audit/search/presence surfaces are derived from the masked `PublicMember`
  shape.

### Whitelist [`§40`]

The initial family seed (Supabase `seed.sql` / `prisma/seed.ts`):

| email | role |
| --- | --- |
| akouekam@gmail.com | Family Chief |
| alibizza85@gmail.com | Family Chief |
| edithyot@gmail.com | Co-Family Chief |
| chainesecondairegabriel@gmail.com | Hidden Admin |
| gabethan1316@gmail.com | Hidden Admin |
| estherpriscilekm@gmail.com | Member |
| gaya74222@gmail.com | Member |
| michaelkm1406@gmail.com | Member |
| michesther6@gmail.com | Member |

First sign-in flow: Google OAuth → `ensureMembership` checks `family_whitelist`,
and only approved emails are provisioned a `User` + `FamilyMember` row.

## Repository layout

```
prisma/schema.prisma       # domain model (canonical with /supabase)
prisma/seed.ts             # Prisma seed (family, whitelist, permissions)
prisma.config.ts           # Prisma CLI config (url from env, seed command)
supabase/
  config.toml              # local Supabase CLI config (Google OAuth)
  migrations/              # RLS policies + role/permission seed
  seed.sql                 # initial family + whitelist seed
src/
  lib/authorization/       # THE security kernel (roles/permissions/whitelist)
  lib/auth/session.ts      # getAccessState + ensureMembership
  lib/supabase/            # browser/server Supabase clients
  lib/validation/          # Zod schemas
  lib/realtime/            # channel/registry naming
  lib/config.ts            # seed family id, storage buckets
  server/queries/          # server data-access helpers
  app/                     # App Router (family shell, auth, admin, setup)
  components/              # layout + UI primitives + core
```

## Environment

See `.env.example`. Public values are prefixed `NEXT_PUBLIC_`; secrets
(supabase service role key, DB connections) are server-only and never imported
from a client component (`src/lib/env.ts`).

## Testing & CI

- Unit tests: `vitest` under `src/**/*.test.ts` (authorization, whitelist).
- E2E smoke: `playwright` under `e2e/`.
- CI: `.github/workflows/ci.yml` runs lint → typecheck → unit → prisma validate
  → production build → e2e.

## Contributing (multi-agent note)

This repo is the shared `src` for ChatGPT, Claude and DevTeamStudios. Keep the
authorization kernel (`src/lib/authorization/*`) the single source of truth for
permission decisions, and keep `prisma/schema.prisma` + `supabase/migrations`
in sync — RLS policies reference the exact (quoted, camelCase) column names
Prisma generates. Column names are camelCase (`"familyId"`); table/enum names
are snake_case (`@@map`).