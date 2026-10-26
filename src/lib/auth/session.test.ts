import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  whitelist: vi.fn(),
  user: vi.fn(),
  updateUser: vi.fn(),
  member: vi.fn(),
  updateMember: vi.fn(),
  createMember: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: mocks.auth } }),
}));
vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    familyWhitelistEntry: { findUnique: mocks.whitelist },
    user: { upsert: mocks.user, update: mocks.updateUser },
    familyMember: {
      findFirst: mocks.member,
      update: mocks.updateMember,
      create: mocks.createMember,
    },
  },
}));
import { getAccessState } from "@/lib/auth/session";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    data: {
      user: {
        id: "user",
        email: "newly-approved@gmail.com",
        user_metadata: {},
      },
    },
  });
  mocks.whitelist.mockResolvedValue({
    status: "ACTIVE",
    internalRole: "MEMBER",
  });
  mocks.member.mockResolvedValue({
    id: "member",
    familyId: "family",
    status: "ACTIVE",
    internalRole: "MEMBER",
    grants: [],
    user: { lastActiveAt: new Date(), email: "newly-approved@gmail.com" },
  });
  mocks.updateMember.mockImplementation(async ({ data }) => ({
    id: "member",
    familyId: "family",
    status: "ACTIVE",
    grants: [],
    ...data,
  }));
});
it("accepts newly approved emails outside the static bootstrap list", async () => {
  expect((await getAccessState()).status).toBe("authorized");
});
it("denies disabled whitelist entries", async () => {
  mocks.whitelist.mockResolvedValue({
    status: "DISABLED",
    internalRole: "MEMBER",
  });
  expect((await getAccessState()).status).toBe("denied");
  expect(mocks.user).not.toHaveBeenCalled();
});
it("does not recreate disabled or removed memberships", async () => {
  mocks.member.mockResolvedValue({
    id: "member",
    familyId: "family",
    status: "DISABLED",
    internalRole: "MEMBER",
    grants: [],
  });
  mocks.updateMember.mockResolvedValue({
    id: "member",
    familyId: "family",
    status: "DISABLED",
    internalRole: "MEMBER",
    grants: [],
  });
  expect((await getAccessState()).status).toBe("denied");
  expect(mocks.createMember).not.toHaveBeenCalled();
  expect(mocks.updateMember).not.toHaveBeenCalled();
});
it("preserves profile edits on subsequent authenticated requests", async () => {
  await getAccessState();
  expect(mocks.user).not.toHaveBeenCalled();
  expect(mocks.updateUser).not.toHaveBeenCalled();
  expect(mocks.updateMember).not.toHaveBeenCalled();
});
it("rejects unknown emails without creating a membership", async () => {
  mocks.whitelist.mockResolvedValue(null);
  expect((await getAccessState()).status).toBe("denied");
  expect(mocks.createMember).not.toHaveBeenCalled();
});
