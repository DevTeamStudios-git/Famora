import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmojiPicker, EMOJI_GRID, QUICK_REACTIONS } from "@/components/chat/emoji-picker";

// Radix interacts via pointer events, which jsdom does not implement.
beforeAll(() => {
  if (!window.PointerEvent) {
    // @ts-expect-error jsdom lacks PointerEvent; MouseEvent is close enough for Radix.
    window.PointerEvent = window.MouseEvent;
  }
});

describe("emoji data", () => {
  it("ships a non-empty grid that covers the quick reactions", () => {
    expect(EMOJI_GRID.length).toBeGreaterThan(0);
    expect(QUICK_REACTIONS.length).toBe(5);
    for (const quick of QUICK_REACTIONS) {
      expect(EMOJI_GRID).toContain(quick);
    }
  });
});

describe("EmojiPicker", () => {
  it("opens on trigger click and reports the selected emoji", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <EmojiPicker
        align="end"
        onSelect={onSelect}
        trigger={<button type="button">Insert emoji</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Insert emoji" }));
    const first = EMOJI_GRID[0];
    const cell = await screen.findByRole("menuitem", { name: `Emoji ${first}` });
    await user.click(cell);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(first);
  });
});