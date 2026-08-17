// Server-only session & membership resolution.
//
// Flow (from the Master Prompt §42.7):
//   Supabase Auth → authenticated Google identity → family-membership lookup →
//   whitelist validation → internal role / permissions → application access.
//
// Successful authentication proves identity; this module decides whether that
// identity belongs to the family.

import "server-only";

import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { MembershipContext } from "@/lib/authorization/authorization";
import { getDisplayRole, type InternalRole } from "@/lib/authorization/roles";
import {
  isSeedWhitelistedEmail,
  normalizeWhitelistEmail,
  seedRoleForEmail,
} from "@/lib/authorization/whitelist";
import { normalizeEmail } from "@/lib/utils";
import { FAMORA_SEED_FAMILY_ID } from "@/lib/config";

export type AccessState =
  | { status: "unauthenticated" }
  | { status: "denied"; user: User }
  | {
      status: "authorized";
      user: User;
      familyId: string;
      memberId: string;
      internalRole: InternalRole;
      displayRole: "FAMILY_CHIEF" | "CO_FAMILY_CHIEF" | "MEMBER";
      membership: MembershipContext;
    };

/**
 * Resolves the current request's access state for the seeded Famora family.
 * The initial deployment is a single-family platform; multi-family support can
 * wrap this with a familyId parameter later.
 */
export async function getAccessState(): Promise<AccessState> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { status: "unauthenticated" };
  }

  const email = normalizeEmail(user.email);

  // Whitelist check: authenticated identity must be an approved account.
  if (!isSeedWhitelistedEmail(email)) {
    return { status: "denied", user };
  }

  const internalRole = await resolvePersistedRole(email);
  if (!internalRole) {
    return { status: "denied", user };
  }

  const membership = await ensureMembership(email, user.id, internalRole);

  return {
    status: "authorized",
    user,
    familyId: membership.familyId,
    memberId: membership.memberId,
    internalRole: membership.internalRole,
    displayRole: getDisplayRole(membership.internalRole),
    membership,
  };
}

/**
 * Whitelist resolution. The seed whitelist is the bootstrap source; the
 * persisted family_whitelist table (managed through the Admin Panel) is
 * authoritative above it.
 */
async function resolvePersistedRole(
  email: string,
): Promise<InternalRole | null> {
  const normalized = normalizeWhitelistEmail(email);
  const persisted = await prisma.familyWhitelistEntry.findUnique({
    where: {
      familyId_email: { familyId: FAMORA_SEED_FAMILY_ID, email: normalized },
    },
    select: { internalRole: true, status: true },
  });
  if (persisted && persisted.status !== "ACTIVE") {
    return null;
  }
  return persisted?.internalRole ?? seedRoleForEmail(email) ?? null;
}

/** Returns (creating if needed) the active membership for an authorized email. */
async function ensureMembership(
  email: string,
  userId: string,
  internalRole: InternalRole,
): Promise<MembershipContext> {
  const existing = await prisma.familyMember.findFirst({
    where: {
      userId,
      familyId: FAMORA_SEED_FAMILY_ID,
      status: { in: ["ACTIVE", "PENDING"] },
    },
    include: { grants: true },
  });

  const member =
    existing ??
    (await prisma.familyMember.create({
      data: {
        userId,
        familyId: FAMORA_SEED_FAMILY_ID,
        internalRole,
        displayRole: getDisplayRole(internalRole),
        status: "ACTIVE",
      },
      include: { grants: true },
    }));

  const grants: Record<string, boolean> = {};
  for (const grant of member.grants) {
    grants[grant.permission] = grant.granted;
  }

  return {
    userId,
    familyId: member.familyId,
    memberId: member.id,
    internalRole: member.internalRole,
    grants,
    membershipActive: member.status === "ACTIVE",
  };
}