import { expect, test } from "@playwright/test";

test("keeps the redesigned workspace usable on desktop and phone screens", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little more together." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  if (
    await page
      .locator("html")
      .evaluate((element) => element.classList.contains("dark"))
  )
    await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.screenshot({
    path: "test-results/web-desktop-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: "test-results/web-desktop-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Tasks", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/web-mobile-tasks.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add new" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Title", { exact: true })).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.getBoundingClientRect().width <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/web-mobile-editor.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
