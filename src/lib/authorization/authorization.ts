// Centralized authorization module (§42.30). Server-side logic must call these
// helpers instead of scattering permission checks across the app. The UI may
// use them to decide what to render, but the server independently enforces the
// same permissions (RLS + server actions).

import {
  DEFAULT_ROLE_PERMISSIONS,
  type PermissionKey,
} from "@/lib/authorization/permissions";
import {
  getDisplayRole,
  getDisplayRoleLabel,
  isHiddenAdmin,
  type DisplayRole,
  type InternalRole,
} from "@/lib/authorization/roles";

/**
 * Authorization context for one user within one family.
 * Assembled server-side only; never rendered to clients.
 */
export type MembershipContext = {
  userId: string;
  familyId: string;
  memberId: string;
  internalRole: InternalRole;
  /** Extra permissions granted (or denied via granted=false) per family. */
  grants: Readonly<Record<string, boolean>>;
  membershipActive: boolean;
};

export function isContextAdministrator(ctx: MembershipContext): boolean {
  return (
    ctx.internalRole === "FAMILY_CHIEF" ||
    ctx.internalRole === "CO_FAMILY_CHIEF" ||
    ctx.internalRole === "HIDDEN_ADMIN"
  );
}

export function resolveEffectivePermissions(
  ctx: Pick<MembershipContext, "internalRole" | "grants">,
): Set<string> {
  const perms = new Set<string>(DEFAULT_ROLE_PERMISSIONS[ctx.internalRole]);
  for (const [key, granted] of Object.entries(ctx.grants)) {
    if (granted) perms.add(key);
    else perms.delete(key);
  }
  return perms;
}

export function hasPermission(
  ctx: Pick<MembershipContext, "internalRole" | "grants" | "membershipActive">,
  permission: PermissionKey,
): boolean {
  if (!ctx.membershipActive && permission !== "family.read") return false;
  return resolveEffectivePermissions(ctx).has(permission);
}

/** Server-side display-role projection (never used for authorization). */
export function publicDisplayRole(
  internalRole: InternalRole,
): DisplayRole {
  return getDisplayRole(internalRole);
}

/** Projected, human-readable role label for a membership (§43.18 masking). */
export function getEffectiveRoleLabel(
  ctx: Pick<MembershipContext, "internalRole">,
): string {
  return getDisplayRoleLabel(ctx.internalRole);
}

export function canAccessAdminPanel(
  ctx: Pick<MembershipContext, "internalRole" | "grants" | "membershipActive">,
): boolean {
  return hasPermission(ctx, "admin_panel.access");
}

export function canModifyWhitelist(
  ctx: Pick<MembershipContext, "internalRole" | "grants" | "membershipActive">,
): boolean {
  return hasPermission(ctx, "whitelist.add") || hasPermission(ctx, "whitelist.remove");
}

export function canDeleteAnyMessage(
  ctx: Pick<MembershipContext, "internalRole" | "grants" | "membershipActive">,
): boolean {
  return hasPermission(ctx, "chat.delete_any_message");
}

export function canModerateChat(
  ctx: Pick<MembershipContext, "internalRole" | "grants" | "membershipActive">,
): boolean {
  return hasPermission(ctx, "chat.moderate");
}

export function canManageMember(
  ctx: Pick<MembershipContext, "internalRole" | "grants" | "membershipActive">,
): boolean {
  return hasPermission(ctx, "members.manage");
}

export function canRemoveMember(
  ctx: Pick<MembershipContext, "internalRole" | "grants" | "membershipActive">,
): boolean {
  return hasPermission(ctx, "members.remove");
}

export function canChangeMemberRole(
  ctx: Pick<MembershipContext, "internalRole" | "grants" | "membershipActive">,
): boolean {
  return hasPermission(ctx, "members.change_role");
}

export function canReadAuditLog(
  ctx: Pick<MembershipContext, "internalRole" | "grants" | "membershipActive">,
): boolean {
  return hasPermission(ctx, "audit.read");
}

export function isHiddenAdminMember(ctx: MembershipContext): boolean {
  return isHiddenAdmin(ctx.internalRole);
}

// ---------------------------------------------------------------------------
// Safe public member representation (§43.22)
// ---------------------------------------------------------------------------

/**
 * Shape returned to ordinary family-facing clients. It intentionally omits
 * internalRole, permissionSet and admin flags so a Hidden Admin can never be
 * detected through normal API responses.
 */
export type PublicMember = {
  id: string;
  memberId: string;
  familyId: string;
  displayName: string;
  avatarUrl: string | null;
  displayRole: DisplayRole;
  presence: "online" | "offline";
};

export function toPublicMember(input: {
  id: string;
  memberId: string;
  familyId: string;
  displayName: string;
  avatarUrl: string | null;
  internalRole: InternalRole;
  isOnline: boolean;
}): PublicMember {
  return {
    id: input.id,
    memberId: input.memberId,
    familyId: input.familyId,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    displayRole: getDisplayRole(input.internalRole),
    presence: input.isOnline ? "online" : "offline",
  };
}