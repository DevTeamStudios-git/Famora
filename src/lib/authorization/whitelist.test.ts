import { describe, expect, it } from "vitest";
import {
  SEED_WHITELIST,
  seedRoleForEmail,
  isSeedWhitelistedEmail,
  normalizeWhitelistEmail,
} from "@/lib/authorization/whitelist";

describe("whitelist", () => {
  it("recognizes every approved seed email", () => {
    for (const entry of SEED_WHITELIST) {
      expect(isSeedWhitelistedEmail(entry.email)).toBe(true);
    }
  });

  it("rejects unknown emails", () => {
    expect(isSeedWhitelistedEmail("intruder@gmail.com")).toBe(false);
    expect(isSeedWhitelistedEmail("")).toBe(false);
  });

  it("normalizes case and whitespace before matching", () => {
    expect(seedRoleForEmail("  AKOUekam@Gmail.com ")).toBe("FAMILY_CHIEF");
    expect(normalizeWhitelistEmail("  EdithYot@GMAIL.com ")).toBe(
      "edithyot@gmail.com",
    );
  });

  it("uses the seed role mapping exactly as specified", () => {
    expect(seedRoleForEmail("akouekam@gmail.com")).toBe("FAMILY_CHIEF");
    expect(seedRoleForEmail("alibizza85@gmail.com")).toBe("FAMILY_CHIEF");
    expect(seedRoleForEmail("edithyot@gmail.com")).toBe("CO_FAMILY_CHIEF");
    expect(seedRoleForEmail("chainesecondairegabriel@gmail.com")).toBe(
      "HIDDEN_ADMIN",
    );
    expect(seedRoleForEmail("gabethan1316@gmail.com")).toBe("HIDDEN_ADMIN");
    expect(seedRoleForEmail("michesther6@gmail.com")).toBe("MEMBER");
  });

  it("seed role lists exactly nine approved identities", () => {
    expect(SEED_WHITELIST).toHaveLength(9);
  });
});