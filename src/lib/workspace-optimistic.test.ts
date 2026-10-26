import { expect, it } from "vitest";
import { applyWorkspaceChange } from "@/lib/workspace-optimistic";
import type { WorkspaceItem } from "@/lib/workspace";
const poll: WorkspaceItem = {
  id: "poll",
  title: "Dinner",
  body: "",
  values: { isMultipleChoice: false },
  options: [
    { id: "a", label: "Pasta", votes: 3, mine: true },
    { id: "b", label: "Soup", votes: 2, mine: false },
  ],
};
it("moves a single-choice vote without double-counting another click on the same answer", () => {
  const moved = applyWorkspaceChange([poll], {
    type: "vote",
    id: "poll",
    optionId: "b",
  });
  expect(
    moved[0].options?.map((option) => [option.votes, option.mine]),
  ).toEqual([
    [2, false],
    [3, true],
  ]);
  const repeated = applyWorkspaceChange(moved, {
    type: "vote",
    id: "poll",
    optionId: "b",
  });
  expect(repeated[0].options).toEqual(moved[0].options);
  expect(poll.options?.[0].votes).toBe(3);
});
it("toggles one multiple-choice answer without changing another choice", () => {
  const changed = applyWorkspaceChange(
    [{ ...poll, values: { isMultipleChoice: true } }],
    { type: "vote", id: "poll", optionId: "a" },
  );
  expect(
    changed[0].options?.map((option) => [option.votes, option.mine]),
  ).toEqual([
    [2, false],
    [2, false],
  ]);
});
