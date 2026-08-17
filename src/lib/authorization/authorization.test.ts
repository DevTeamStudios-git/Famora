import { describe, expect, it } from "vitest";
import {
  hasPermission,
  resolveEffectivePermissions,
  toPublicMember,
  getEffectiveRoleLabel,
} from "@/lib/authorization/authorization";
import {
  getDisplayRole,
  getDisplayRoleLabel,
  ROLE_RANK,
} from "@/lib/authorization/roles";
import type { InternalRole } from "@/lib/authorization/roles";

function ctx(role: InternalRole, grants: Record<string, boolean> = {}, active = true) {
  return {
    userId: "user-1",
    familyId: "family-1",
    memberId: "member-1",
    internalRole: role,
    grants,
    membershipActive: active,
  };
}

describe("authorization", () => {
  it("member cannot access the Admin Panel", () => {
    expect(hasPermission(ctx("MEMBER"), "admin_panel.access")).toBe(false);
  });

  it("Co-Chief has admin_panel.access by default", () => {
    expect(hasPermission(ctx("CO_FAMILY_CHIEF"), "admin_panel.access")).toBe(true);
  });

  it("Co-Chief does not hold sensitive chief-only permissions by default", () => {
    expect(hasPermission(ctx("CO_FAMILY_CHIEF"), "whitelist.add")).toBe(false);
    expect(hasPermission(ctx("CO_FAMILY_CHIEF"), "members.remove")).toBe(false);
    expect(hasPermission(ctx("CO_FAMILY_CHIEF"), "security.manage")).toBe(false);
  });

  it("Family Chief holds the full permission set", () => {
    expect(hasPermission(ctx("FAMILY_CHIEF"), "whitelist.add")).toBe(true);
    expect(hasPermission(ctx("FAMILY_CHIEF"), "security.emergency")).toBe(true);
    expect(hasPermission(ctx("FAMILY_CHIEF"), "family.delete")).toBe(true);
  });

  it("Hidden Admin holds the full permission set for enforcement", () => {
    expect(hasPermission(ctx("HIDDEN_ADMIN"), "admin_panel.access")).toBe(true);
    expect(hasPermission(ctx("HIDDEN_ADMIN"), "audit.read")).toBe(true);
  });

  it("grants can add and revoke permissions per family", () => {
    const promoted = resolveEffectivePermissions(
      ctx("CO_FAMILY_CHIEF", { "whitelist.add": true }),
    );
    expect(promoted.has("whitelist.add")).toBe(true);

    const demoted = resolveEffectivePermissions(
      ctx("HIDDEN_ADMIN", { "audit.read": false }),
    );
    expect(demoted.has("audit.read")).toBe(false);
  });

  it("inactive membership blocks everything except family.read", () => {
    const inactive = ctx("FAMILY_CHIEF", {}, false);
    expect(hasPermission(inactive, "family.read")).toBe(true);
    expect(hasPermission(inactive, "members.read")).toBe(false);
  });

  it("Hidden Admin projects to display role MEMBER (§43.18)", () => {
    expect(getDisplayRole("HIDDEN_ADMIN")).toBe("MEMBER");
    expect(getDisplayRoleLabel("HIDDEN_ADMIN")).toBe("Member");
  });

  it("display role labels mask correctly for all roles", () => {
    expect(getDisplayRoleLabel("FAMILY_CHIEF")).toBe("Family Chief");
    expect(getDisplayRoleLabel("CO_FAMILY_CHIEF")).toBe("Co-Family Chief");
    expect(getDisplayRoleLabel("MEMBER")).toBe("Member");
  });

  it("role rank cannot promote member above chief", () => {
    expect(ROLE_RANK.FAMILY_CHIEF).toBeGreaterThan(ROLE_RANK.CO_FAMILY_CHIEF);
    expect(ROLE_RANK.CO_FAMILY_CHIEF).toBeGreaterThan(ROLE_RANK.MEMBER);
  });

  it("toPublicMember never leaks internalRole", () => {
    const publicMember = toPublicMember({
      id: "user-1",
      memberId: "member-1",
      familyId: "family-1",
      displayName: "Gabriel",
      avatarUrl: null,
      internalRole: "HIDDEN_ADMIN",
      isOnline: false,
    });
    expect(publicMember).not.toHaveProperty("internalRole");
    expect(publicMember.displayRole).toBe("MEMBER");
  });
});

describe("getEffectiveRoleLabel", () => {
  it("resolves the projected display label for a membership", () => {
    expect(getEffectiveRoleLabel(ctx("HIDDEN_ADMIN"))).toBe("Member");
    expect(getEffectiveRoleLabel(ctx("FAMILY_CHIEF"))).toBe("Family Chief");
  });
});