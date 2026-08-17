// Seed whitelist for the initial Famora family (§40.20).
//
// These emails are DATA, not scattered checks. They are loaded into the
// database initialization layer (Supabase seed / Prisma seed) and authorization
// must always depend on the persisted membership + internal role, never on
// hardcoded email comparisons in application code.

import { normalizeEmail } from "@/lib/utils";
import type { InternalRole } from "@/lib/authorization/roles";

export type SeedWhitelistEntry = {
  email: string;
  internalRole: InternalRole;
};

/** Initial Famora family whitelist — exactly as specified in the Master Prompt. */
export const SEED_WHITELIST: readonly SeedWhitelistEntry[] = [
  { email: "akouekam@gmail.com", internalRole: "FAMILY_CHIEF" },
  { email: "alibizza85@gmail.com", internalRole: "FAMILY_CHIEF" },
  { email: "edithyot@gmail.com", internalRole: "CO_FAMILY_CHIEF" },
  { email: "chainesecondairegabriel@gmail.com", internalRole: "HIDDEN_ADMIN" },
  { email: "gabethan1316@gmail.com", internalRole: "HIDDEN_ADMIN" },
  { email: "estherpriscilekm@gmail.com", internalRole: "MEMBER" },
  { email: "gaya74222@gmail.com", internalRole: "MEMBER" },
  { email: "michaelkm1406@gmail.com", internalRole: "MEMBER" },
  { email: "michesther6@gmail.com", internalRole: "MEMBER" },
];

export function normalizeWhitelistEmail(email: string): string {
  return normalizeEmail(email);
}

/**
 * Looks up the seed role for a normalized email. Returns null when the email
 * is not part of the initial Famora family.
 */
export function seedRoleForEmail(email: string): InternalRole | null {
  const normalized = normalizeWhitelistEmail(email);
  return SEED_WHITELIST.find((entry) => entry.email === normalized)
    ?.internalRole ?? null;
}

export function isSeedWhitelistedEmail(email: string): boolean {
  return seedRoleForEmail(email) !== null;
}