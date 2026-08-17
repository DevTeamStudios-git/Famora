// Famora authorization — internal vs display roles.
//
// The Hidden Admin rule is a HARD requirement:
//   - internal role HIDDEN_ADMIN is used for authorization only.
//   - display role is always MEMBER in family-facing interfaces.
//   - the only user-facing place where "Hidden Admin" may appear is the
//     holder's own Settings → My Role & Permissions page.
//
// Never drive security decisions from a display role.

/**
 * Internal roles mirror the Prisma `InternalRole` enum. These are the only
 * values the authorization engine consumes.
 */
export type InternalRole =
  | "FAMILY_CHIEF"
  | "CO_FAMILY_CHIEF"
  | "HIDDEN_ADMIN"
  | "MEMBER";

/**
 * Public display roles mirror the Prisma `DisplayRole` enum. A Hidden Admin is
 * always projected to MEMBER.
 */
export type DisplayRole = "FAMILY_CHIEF" | "CO_FAMILY_CHIEF" | "MEMBER";

export const INTERNAL_ROLES: readonly InternalRole[] = [
  "FAMILY_CHIEF",
  "CO_FAMILY_CHIEF",
  "HIDDEN_ADMIN",
  "MEMBER",
] as const;

export const INTERNAL_ROLE_LABELS: Record<InternalRole, string> = {
  FAMILY_CHIEF: "Family Chief",
  CO_FAMILY_CHIEF: "Co-Family Chief",
  HIDDEN_ADMIN: "Hidden Admin",
  MEMBER: "Member",
};

export const DISPLAY_ROLE_LABELS: Record<DisplayRole, string> = {
  FAMILY_CHIEF: "Family Chief",
  CO_FAMILY_CHIEF: "Co-Family Chief",
  MEMBER: "Member",
};

/**
 * Public role projection used across all family-facing UI. The Hidden Admin is
 * masked as a regular Member — including inside the Admin Panel.
 */
export function getDisplayRole(internalRole: InternalRole): DisplayRole {
  switch (internalRole) {
    case "FAMILY_CHIEF":
      return "FAMILY_CHIEF";
    case "CO_FAMILY_CHIEF":
      return "CO_FAMILY_CHIEF";
    case "HIDDEN_ADMIN":
      return "MEMBER";
    case "MEMBER":
      return "MEMBER";
  }
}

export function getDisplayRoleLabel(internalRole: InternalRole): string {
  return DISPLAY_ROLE_LABELS[getDisplayRole(internalRole)];
}

export function isHiddenAdmin(internalRole: InternalRole): boolean {
  return internalRole === "HIDDEN_ADMIN";
}

export function isAdministrator(internalRole: InternalRole): boolean {
  return (
    internalRole === "FAMILY_CHIEF" ||
    internalRole === "CO_FAMILY_CHIEF" ||
    internalRole === "HIDDEN_ADMIN"
  );
}

/** Rank used only to guard "cannot promote above chief" style rules. */
export const ROLE_RANK: Record<InternalRole, number> = {
  FAMILY_CHIEF: 4,
  CO_FAMILY_CHIEF: 3,
  HIDDEN_ADMIN: 3,
  MEMBER: 1,
};