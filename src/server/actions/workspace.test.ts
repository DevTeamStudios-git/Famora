import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const tables = [
    "familyFeature",
    "familySettings",
    "task",
    "taskHistory",
    "taskAssignment",
    "familyMember",
    "notebook",
    "notebookPage",
    "notebookPageVersion",
    "familyContact",
    "recipe",
    "announcement",
    "poll",
    "pollVote",
    "auditLog",
    "familyGrant",
    "familyWhitelistEntry",
    "user",
    "userSettings",
    "userNotificationPreference",
    "conversation",
    "message",
    "notification",
    "calendarEvent",
    "eventCategory",
    "eventAttendee",
    "eventReminder",
  ];
  const db = Object.fromEntries(
    tables.map((table) => [
      table,
      Object.fromEntries(
        [
          "findFirst",
          "findUnique",
          "findMany",
          "create",
          "createMany",
          "update",
          "updateMany",
          "upsert",
          "delete",
          "deleteMany",
        ].map((method) => [method, vi.fn()]),
      ),
    ]),
  );
  const access = {
    status: "authorized",
    familyId: "00000000-0000-4000-8000-000000000001",
    memberId: "00000000-0000-4000-8000-000000000002",
    user: {
      id: "00000000-0000-4000-8000-000000000003",
      email: "member@example.com",
    },
    internalRole: "MEMBER",
    membership: {
      internalRole: "MEMBER",
      grants: {} as Record<string, boolean>,
      membershipActive: true,
    },
  };
  return { db, access, session: vi.fn(), transaction: vi.fn() };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getAccessState: mocks.session }));
vi.mock("@/lib/prisma/client", () => ({
  prisma: { ...mocks.db, $transaction: mocks.transaction },
}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
import {
  saveWorkspaceItem,
  deleteWorkspaceItem,
  voteInPoll,
} from "@/server/actions/workspace";
import { sendDirectMessage } from "@/server/actions/dms";
import { administer } from "@/server/actions/admin";
import { loadWorkspace } from "@/server/queries/workspace";
import { updateAgendaEvent } from "@/server/actions/agenda";

const id = "00000000-0000-4000-8000-000000000004";
function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([k, v]) => data.set(k, v));
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.membership.internalRole = "MEMBER";
  mocks.access.membership.grants = {};
  mocks.session.mockResolvedValue(mocks.access);
  mocks.db.familyFeature.findUnique.mockResolvedValue(null);
  mocks.db.familySettings.findUnique.mockResolvedValue(null);
  mocks.transaction.mockImplementation(
    async (callback: (db: typeof mocks.db) => unknown) => callback(mocks.db),
  );
});
describe("workspace mutations and authorization", () => {
  it("rejects stale calendar edits without overwriting newer data", async () => {
    mocks.db.calendarEvent.findFirst.mockResolvedValue({
      id,
      familyId: mocks.access.familyId,
      createdByMemberId: mocks.access.memberId,
      visibility: "FAMILY",
      version: 4,
      startAt: new Date("2026-10-25T10:00:00Z"),
      endAt: new Date("2026-10-25T11:00:00Z"),
    });
    mocks.db.calendarEvent.updateMany.mockResolvedValue({ count: 0 });
    const result = await updateAgendaEvent(id, {
      title: "Stale title",
      version: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("changed since you opened");
    expect(mocks.db.calendarEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyId: mocks.access.familyId,
          version: 3,
        }),
      }),
    );
    expect(mocks.db.eventAttendee.deleteMany).not.toHaveBeenCalled();
  });
  it("creates a task with completion history and authenticated family scope", async () => {
    mocks.db.task.create.mockResolvedValue({ id });
    const result = await saveWorkspaceItem(
      "tasks",
      null,
      form({ title: "Book dentist", status: "COMPLETED", priority: "HIGH" }),
    );
    expect(result).toEqual({ success: "Saved." });
    expect(mocks.db.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: mocks.access.familyId,
        createdByMemberId: mocks.access.memberId,
        completedByMemberId: mocks.access.memberId,
        completedAt: expect.any(Date),
        title: "Book dentist",
      }),
    });
    expect(mocks.db.taskHistory.create).toHaveBeenCalled();
  });
  it("rejects blank titles without writing", async () => {
    expect(
      (
        await saveWorkspaceItem(
          "tasks",
          null,
          form({ title: " ", status: "TODO", priority: "LOW" }),
        )
      ).error,
    ).toBeTruthy();
    expect(mocks.db.task.create).not.toHaveBeenCalled();
  });
  it("honors denied grants even for ordinary task creation", async () => {
    mocks.access.membership.grants = { "tasks.create": false };
    expect(
      (await saveWorkspaceItem("tasks", null, form({ title: "Denied" }))).error,
    ).toContain("permission");
    expect(mocks.db.task.create).not.toHaveBeenCalled();
  });
  it("blocks writes to disabled tools", async () => {
    mocks.db.familyFeature.findUnique.mockResolvedValue({ enabled: false });
    expect(
      (await saveWorkspaceItem("tasks", null, form({ title: "Disabled" })))
        .error,
    ).toContain("disabled");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects assignment without tasks.assign", async () => {
    const result = await saveWorkspaceItem(
      "tasks",
      null,
      form({ title: "Task", status: "TODO", priority: "LOW", assigneeId: id }),
    );
    expect(result.error).toContain("assign");
    expect(mocks.db.task.create).not.toHaveBeenCalled();
  });
  it("cannot edit another person's private notebook page", async () => {
    mocks.db.notebookPage.findFirst.mockResolvedValue(null);
    const result = await saveWorkspaceItem(
      "personal",
      id,
      form({ title: "Private", body: "Secret" }),
    );
    expect(result.error).toContain("not found");
    expect(mocks.db.notebookPage.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        notebook: { type: "PERSONAL", ownerId: mocks.access.user.id },
      }),
    });
    expect(mocks.db.notebookPage.update).not.toHaveBeenCalled();
  });
  it("snapshots note content before editing", async () => {
    const old = { type: "doc", content: [] };
    mocks.db.notebookPage.findFirst.mockResolvedValue({ content: old });
    expect(
      (
        await saveWorkspaceItem(
          "personal",
          id,
          form({ title: "Updated", body: "New body" }),
        )
      ).success,
    ).toBeTruthy();
    expect(mocks.db.notebookPageVersion.create).toHaveBeenCalledWith({
      data: { pageId: id, editorMemberId: mocks.access.memberId, content: old },
    });
  });
  it("blocks deletion when the role lacks tasks.delete", async () => {
    expect((await deleteWorkspaceItem("tasks", id)).error).toContain(
      "permission",
    );
    expect(mocks.db.task.update).not.toHaveBeenCalled();
  });
  it("filters personal notebook reads by owner", async () => {
    mocks.db.notebookPage.findMany.mockResolvedValue([]);
    await loadWorkspace("personal");
    expect(mocks.db.notebookPage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          notebook: { type: "PERSONAL", ownerId: mocks.access.user.id },
        }),
      }),
    );
  });
  it("prevents votes in a poll from another family", async () => {
    mocks.db.poll.findFirst.mockResolvedValue(null);
    expect((await voteInPoll(id, id)).error).toContain("closed");
    expect(mocks.db.poll.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, familyId: mocks.access.familyId },
      }),
    );
    expect(mocks.db.pollVote.create).not.toHaveBeenCalled();
  });
  it("prevents invalid options from being voted on", async () => {
    mocks.db.poll.findFirst.mockResolvedValue({
      status: "OPEN",
      deadline: null,
      options: [],
      votes: [],
    });
    expect((await voteInPoll(id, id)).error).toContain("Invalid option");
    expect(mocks.db.pollVote.create).not.toHaveBeenCalled();
  });
  it("replaces a single choice vote atomically", async () => {
    mocks.db.poll.findFirst.mockResolvedValue({
      status: "OPEN",
      deadline: null,
      options: [{ id }],
      votes: [],
      isMultipleChoice: false,
      allowChangeVote: true,
    });
    expect((await voteInPoll(id, id)).success).toBeTruthy();
    expect(mocks.db.pollVote.deleteMany).toHaveBeenCalledWith({
      where: { pollId: id, memberId: mocks.access.memberId },
    });
    expect(mocks.db.pollVote.create).toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });
  it("rejects direct-message sends from nonparticipants", async () => {
    mocks.db.conversation.findFirst.mockResolvedValue(null);
    expect(
      (await sendDirectMessage(id, form({ body: "Unauthorized" }))).error,
    ).toContain("not available");
    expect(mocks.db.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          members: { some: { memberId: mocks.access.memberId } },
        }),
      }),
    );
    expect(mocks.db.message.create).not.toHaveBeenCalled();
  });
  it("rejects scheduled announcements without a schedule", async () => {
    mocks.access.membership.grants = { "announcements.manage": true };
    expect(
      (
        await saveWorkspaceItem(
          "announcements",
          null,
          form({
            title: "News",
            body: "Body",
            status: "SCHEDULED",
            priority: "NORMAL",
          }),
        )
      ).error,
    ).toContain("publication date");
    expect(mocks.db.announcement.create).not.toHaveBeenCalled();
  });
  it("rejects admin access changes without confirmation", async () => {
    mocks.access.membership.internalRole = "FAMILY_CHIEF";
    const result = await administer("member", form({ id, status: "DISABLED" }));
    expect(result.error).toContain("CONFIRM");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("does not overwrite existing whitelist entries when approving an email", async () => {
    mocks.access.membership.internalRole = "FAMILY_CHIEF";
    const result = await administer(
      "whitelist",
      form({ email: "New@Example.com", role: "MEMBER" }),
    );
    expect(result.success).toBeTruthy();
    expect(mocks.db.familyWhitelistEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "new@example.com",
        internalRole: "MEMBER",
      }),
    });
    expect(mocks.db.familyWhitelistEntry.upsert).not.toHaveBeenCalled();
  });
});
