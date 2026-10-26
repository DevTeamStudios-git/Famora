import { test, expect } from "@playwright/test";

test("login page renders the Google sign-in entry", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: /continue with google/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /welcome to famora/i }),
  ).toBeVisible();
});

test("setup page explains missing configuration when env is unset", async ({
  page,
}) => {
  const response = await page.goto("/setup");
  // 200, or a redirect to /login when the environment IS configured locally.
  expect(response?.status()).toBeLessThan(400);
  if (new URL(page.url()).pathname === "/setup") {
    await expect(
      page.getByRole("heading", { name: /not configured yet/i }),
    ).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("button", { name: /continue with google/i }),
    ).toBeVisible();
  }
});

test("unauthenticated visitors are pushed toward authentication", async ({
  page,
}) => {
  const res = await page.goto("/agenda");
  const finalUrl = page.url();
  // Middleware (when configured) or the (family) layout routes to /login|/setup.
  expect(res?.status()).toBeLessThan(400);
  expect(finalUrl).toMatch(/login|setup/);
});
