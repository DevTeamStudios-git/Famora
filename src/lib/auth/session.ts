// Server-only session & membership resolution.
//
// Flow (from the Master Prompt §42.7):
//   Supabase Auth → authenticated Google identity → family-membership lookup →
//   whitelist validation → internal role / permissions → application access.
//
// Successful authentication proves identity; this module decides whether that
// identity belongs to the family.

import "server-only";
import { cache } from "react";
import { nativeAccessToken, memoNativeRequest } from "@/lib/auth/native-context";

import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { MembershipContext } from "@/lib/authorization/authorization";
import { getDisplayRole, type InternalRole } from "@/lib/authorization/roles";
import {
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
export const getAccessState = cache(() => memoNativeRequest("access", resolveAccessState));
async function resolveAccessState(): Promise<AccessState> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(nativeAccessToken());

  if (!user?.email) {
    return { status: "unauthenticated" };
  }

  const email = normalizeEmail(user.email);

  const internalRole = await resolvePersistedRole(email);
  if (!internalRole) {
    return { status: "denied", user };
  }

  const membership = await ensureMembership(email, user.id, internalRole, {
    displayName:
      (user.user_metadata?.full_name as string | undefined) ??
      user.email?.split("@")[0] ??
      user.email,
    avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
  });

  if (!membership.membershipActive) return { status: "denied", user };

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
  profile: { displayName: string; avatarUrl: string | null },
): Promise<MembershipContext> {
  const existing = await prisma.familyMember.findFirst({
    where: { userId, familyId: FAMORA_SEED_FAMILY_ID },
    include: { grants: true, user: { select: { lastActiveAt: true, email: true } } },
  });
  // Ordinary reads do not rewrite identity and membership rows. Activity is
  // sampled at most once every five minutes, keeping navigation read-heavy.
  if (existing?.status === "ACTIVE" && existing.user &&
    (!existing.user.lastActiveAt || Date.now() - existing.user.lastActiveAt.getTime() > 300000)) {
    await prisma.user.update({ where: { id: userId }, data: { email, lastActiveAt: new Date() } });
  }
  if (!existing) await prisma.user.upsert({
    where: { id: userId },
    update: {
      email,
      lastActiveAt: new Date(),
    },
    create: {
      id: userId,
      email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      lastActiveAt: new Date(),
    },
  });

  const member = existing
    ? existing.status !== "ACTIVE" || existing.internalRole === internalRole ? existing : await prisma.familyMember.update({
        where: { id: existing.id },
        data: { internalRole, displayRole: getDisplayRole(internalRole) },
        include: { grants: true },
      })
    : await prisma.familyMember.create({
        data: {
          userId,
          familyId: FAMORA_SEED_FAMILY_ID,
          internalRole,
          displayRole: getDisplayRole(internalRole),
          status: "ACTIVE",
        },
        include: { grants: true },
      });

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
