import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  vote: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/server/actions/workspace", () => ({
  saveWorkspaceItem: mocks.save,
  deleteWorkspaceItem: mocks.remove,
  voteInPoll: mocks.vote,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/server/actions/notebook", () => ({
  fetchNoteHistory: vi.fn(),
  restoreNoteVersion: vi.fn(),
}));
import { FormField, Workspace } from "@/components/core/workspace";
import type { WorkspaceItem } from "@/lib/workspace";
const item: WorkspaceItem = {
  id: "task-id",
  title: "Buy groceries",
  body: "Fruit and bread",
  detail: "TODO · HIGH",
  values: {
    title: "Buy groceries",
    description: "Fruit and bread",
    status: "TODO",
    priority: "HIGH",
  },
};
const base = {
  kind: "tasks" as const,
  items: [item],
  members: [],
  canCreate: true,
  canEdit: true,
  canDelete: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ success: "Saved." });
  mocks.remove.mockResolvedValue({ success: "Deleted." });
});
describe("family workspace UI", () => {
  it("associates repeated field names with their own labels", async () => {
    const user = userEvent.setup();
    render(
      <>
        <FormField
          field={{ name: "enabled", label: "Enable chat", type: "checkbox" }}
          value={true}
        />
        <FormField
          field={{
            name: "enabled",
            label: "Enable contacts",
            type: "checkbox",
          }}
          value={true}
        />
      </>,
    );
    await user.click(screen.getByLabelText("Enable contacts"));
    expect(screen.getByLabelText("Enable contacts")).not.toBeChecked();
    expect(screen.getByLabelText("Enable chat")).toBeChecked();
  });
  it("searches and filters tasks", async () => {
    const user = userEvent.setup();
    render(<Workspace {...base} />);
    await user.type(
      screen.getByRole("textbox", { name: "Search Tasks" }),
      "dentist",
    );
    expect(screen.getByText("No matching items.")).toBeVisible();
    await user.clear(screen.getByRole("textbox", { name: "Search Tasks" }));
    expect(
      screen.getByRole("heading", { name: "Buy groceries" }),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter task status" }),
      "COMPLETED",
    );
    expect(screen.getByText("No matching items.")).toBeVisible();
  });
  it("creates a task through its form without a redundant refresh", async () => {
    const user = userEvent.setup();
    render(<Workspace {...base} />);
    await user.click(screen.getByRole("button", { name: "Add new" }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Title" }),
      "Book dentist",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const [kind, id, data] = mocks.save.mock.calls[0];
    expect(kind).toBe("tasks");
    expect(id).toBeNull();
    expect(data.get("title")).toBe("Book dentist");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("keeps the editor open when the server rejects the input", async () => {
    mocks.save.mockResolvedValue({ error: "You cannot assign tasks." });
    const user = userEvent.setup();
    render(<Workspace {...base} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Title" })).toHaveValue(
      "Buy groceries",
    );
    await user.clear(within(dialog).getByRole("textbox", { name: "Title" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Title" }),
      "Updated groceries",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You cannot assign tasks.",
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(
      within(screen.getByRole("dialog")).getByRole("textbox", {
        name: "Title",
      }),
    ).toHaveValue("Updated groceries");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("shows a new task immediately and restores a rejected draft without an existing ID", async () => {
    let finish!: (result: { error: string }) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<Workspace {...base} />);
    await user.click(screen.getByRole("button", { name: "Add new" }));
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Instant task",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("heading", { name: "Instant task" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => finish({ error: "Please try again." }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please try again.",
    );
    expect(
      screen.queryByRole("heading", { name: "Instant task" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Instant task",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1]).toBeNull();
  });
  it("removes a confirmed deletion immediately and rolls it back when saving fails", async () => {
    let finish!: (result: { error: string }) => void;
    mocks.remove.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<Workspace {...base} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(
      screen.queryByRole("heading", { name: "Buy groceries" }),
    ).not.toBeInTheDocument();
    await act(async () => finish({ error: "Access changed." }));
    expect(
      await screen.findByRole("heading", { name: "Buy groceries" }),
    ).toBeVisible();
  });
  it("requires a separate confirmation before deleting", async () => {
    const user = userEvent.setup();
    render(<Workspace {...base} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith("tasks", item.id),
    );
  });
  it("hides creation and mutation controls for read-only users", () => {
    render(
      <Workspace
        {...base}
        canCreate={false}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Add new" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
  it("retains line breaks in notebook content", () => {
    render(
      <Workspace
        {...base}
        kind="personal"
        items={[{ ...item, body: "First paragraph\nSecond paragraph" }]}
      />,
    );
    expect(screen.getByText(/First paragraph/).textContent).toBe(
      "First paragraph\nSecond paragraph",
    );
  });
});
