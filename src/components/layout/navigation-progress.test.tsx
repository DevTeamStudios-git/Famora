import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));
import { NavigationProgress } from "@/components/layout/navigation-progress";
afterEach(() => vi.useRealTimers());
it("shows immediate progress even when a client link prevents browser navigation", () => {
  render(
    <>
      <NavigationProgress />
      <a href="/recipes" onClick={(event) => event.preventDefault()}>
        Recipes
      </a>
    </>,
  );
  fireEvent.click(screen.getByRole("link", { name: "Recipes" }));
  expect(screen.getByRole("status", { name: "Opening page" })).toBeVisible();
});
it("ignores modified clicks and links to the current page", () => {
  render(
    <>
      <NavigationProgress />
      <a href="/tasks">Tasks</a>
      <a href="/recipes">Recipes</a>
    </>,
  );
  fireEvent.click(screen.getByRole("link", { name: "Tasks" }));
  fireEvent.click(screen.getByRole("link", { name: "Recipes" }), {
    ctrlKey: true,
  });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
