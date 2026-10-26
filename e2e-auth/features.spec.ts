import { test, expect } from "@playwright/test";
test.describe.serial("authenticated family workflows", () => {
  test("moves and resizes a calendar event with persisted times", async ({
    page,
  }) => {
    await page.goto("/agenda");
    const day = await page.evaluate(() =>
      new Date().toLocaleDateString("en-CA"),
    );
    await page
      .getByRole("button", { name: "Create event", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Title", { exact: true })
      .fill("E2E draggable event");
    await dialog.getByLabel("Start", { exact: true }).fill(`${day}T10:00`);
    await dialog.getByLabel("End", { exact: true }).fill(`${day}T11:00`);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page
      .getByRole("button", { name: "Calendar view", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Day", exact: true }).click();
    const resize = page.getByRole("button", {
      name: "Resize E2E draggable event",
      exact: true,
    });
    await resize.scrollIntoViewIfNeeded();
    let updated = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        (response.request().postData()?.includes('"version"') ?? false),
    );
    await resize.press("ArrowDown");
    await updated;
    await page.reload();
    await page
      .getByRole("button", { name: "Calendar view", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Day", exact: true }).click();
    const event = page.getByRole("group", {
      name: "E2E draggable event",
      exact: true,
    });
    const destination = page.getByRole("button", {
      name: "Create event at 12:00",
      exact: true,
    });
    updated = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        (response.request().postData()?.includes('"version"') ?? false),
    );
    await event.dragTo(destination);
    await updated;
    await page.reload();
    await page
      .getByRole("group", { name: "E2E draggable event", exact: true })
      .click();
    await page.getByRole("button", { name: "Edit event", exact: true }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Start", { exact: true })).toHaveValue(
      `${day}T12:00`,
    );
    await expect(dialog.getByLabel("End", { exact: true })).toHaveValue(
      `${day}T13:15`,
    );
  });
  test("creates, filters, completes and deletes a task", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByRole("button", { name: "Add new" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Title", { exact: true })
      .fill("E2E grocery shopping");
    await dialog.getByLabel("Description").fill("Fruit and bread");
    await dialog.getByLabel("Assign to").selectOption({ label: "Test Member" });
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const card = page
      .getByRole("article")
      .filter({ hasText: "E2E grocery shopping" });
    await expect(card).toContainText("Test Member");
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog
      .getByLabel("Status", { exact: true })
      .selectOption("COMPLETED");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page
      .getByRole("combobox", { name: "Filter task status" })
      .selectOption("COMPLETED");
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(card).toBeHidden();
  });
  for (const entry of [
    {
      path: "/notebook",
      title: "E2E family note",
      body: "Shared family knowledge",
    },
    {
      path: "/notebook/personal",
      title: "E2E private note",
      body: "Only visible to the test owner",
    },
  ])
    test(`saves and edits ${entry.path}`, async ({ page }) => {
      await page.goto(entry.path);
      await page.getByRole("button", { name: "Add new" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Title", { exact: true }).fill(entry.title);
      await dialog.getByRole("textbox").last().fill(entry.body);
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole("article").filter({ hasText: entry.title }),
      ).toContainText(entry.body);
      await page.reload();
      await expect(
        page.getByRole("article").filter({ hasText: entry.title }),
      ).toContainText(entry.body);
      const card = page.getByRole("article").filter({ hasText: entry.title });
      await card.getByRole("button", { name: "Edit", exact: true }).click();
      await dialog.getByRole("textbox").last().fill("Updated note body");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(card).toContainText("Updated note body");
      await card.getByRole("button", { name: "History", exact: true }).click();
      await expect(dialog).toContainText(entry.body);
      await dialog
        .getByRole("button", { name: "Restore this version", exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await expect(card).toContainText(entry.body);
    });
  test("creates a contact and a recipe", async ({ page }) => {
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Add new" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill("E2E Dentist");
    await dialog.getByLabel("Category").fill("Health");
    await dialog.getByLabel("Phone").fill("555-0100");
    await dialog.getByLabel("Emergency contact").check();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("article").filter({ hasText: "E2E Dentist" }),
    ).toContainText("Emergency");
    await page.goto("/tools/recipes");
    await page.getByRole("button", { name: "Add new" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title", { exact: true }).fill("E2E Soup");
    await dialog.getByLabel("Ingredients").fill("Water\nCarrots");
    await dialog.getByLabel("Instructions").fill("Simmer until tender.");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("article").filter({ hasText: "E2E Soup" }),
    ).toContainText("Simmer until tender.");
  });
  test("publishes an announcement and votes in a poll", async ({ page }) => {
    await page.goto("/announcements");
    await page.getByRole("button", { name: "Add new" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title", { exact: true }).fill("E2E Dinner notice");
    await dialog
      .getByLabel("Announcement", { exact: true })
      .fill("Dinner at six.");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("article").filter({ hasText: "E2E Dinner notice" }),
    ).toContainText("PUBLISHED");
    await page.goto("/tools/polls");
    await page.getByRole("button", { name: "Add new" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Question").fill("E2E Where for dinner?");
    await dialog.getByLabel("Options").fill("Home\nRestaurant");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const card = page
      .getByRole("article")
      .filter({ hasText: "E2E Where for dinner?" });
    await card.getByRole("button", { name: /Home/ }).click();
    await expect(card.getByRole("button", { name: /Home/ })).toContainText("1");
  });
  test("uploads and downloads a file", async ({ page }) => {
    await page.goto("/files");
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill("E2E shopping list");
    await dialog
      .getByLabel("File (up to 10 MB)", { exact: true })
      .setInputFiles({
        name: "shopping.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Fruit and bread"),
      });
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const download = page
      .getByRole("article")
      .filter({ hasText: "E2E shopping list" })
      .getByRole("link", { name: "Download file" });
    await expect(download).toBeVisible();
    const response = await page.request.get(
      (await download.getAttribute("href"))!,
    );
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toBe("Fruit and bread");
  });
  test("creates and edits an agenda event", async ({ page }) => {
    await page.goto("/agenda");
    await page
      .getByRole("button", { name: "Create event", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title", { exact: true }).fill("E2E Dinner event");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("E2E Dinner event").first()).toBeVisible();
    await page.getByText("E2E Dinner event").first().click();
    await page.getByRole("button", { name: "Edit event", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Title", { exact: true })
      .fill("E2E Dinner updated");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("E2E Dinner updated").first()).toBeVisible();
    await page.getByText("E2E Dinner updated").first().click();
    await page
      .getByRole("textbox", { name: "Comment", exact: true })
      .fill("Bring dessert.");
    await page
      .getByRole("button", { name: "Add comment", exact: true })
      .click();
    await expect(
      page.getByRole("article").filter({ hasText: "Bring dessert." }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Checklist item", exact: true })
      .fill("Set the table");
    await page
      .getByRole("button", { name: "Add checklist item", exact: true })
      .click();
    await expect(
      page.getByText("Set the table", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Family file", exact: true })
      .selectOption({ label: "E2E shopping list" });
    await page
      .getByRole("button", { name: "Attach file", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "E2E shopping list" }),
    ).toBeVisible();
  });
  test("sends a private message and saves profile settings", async ({
    page,
  }) => {
    await page.goto("/dms");
    await page
      .getByLabel("Family member")
      .selectOption({ label: "Test Member" });
    await page.getByRole("button", { name: "Start conversation" }).click();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("E2E private hello");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByRole("article").filter({ hasText: "E2E private hello" }),
    ).toBeVisible();
    await page.goto("/settings/profile");
    await page.getByLabel("Display name").fill("Test Chief Updated");
    await page
      .getByLabel("Avatar (JPEG, PNG or WebP, up to 3 MB)")
      .setInputFiles({
        name: "avatar.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Profile saved.");
    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue(
      "Test Chief Updated",
    );
    await expect(
      page
        .getByRole("img", { name: "Test Chief Updated", exact: true })
        .first(),
    ).toBeVisible();
  });
  test("searches persisted family content", async ({ page }) => {
    await page.goto("/search?q=E2E");
    await expect(page.getByRole("link", { name: /E2E Soup/ })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /E2E family note/ }),
    ).toBeVisible();
  });
  test("uploads a photo memory into an album", async ({ page }) => {
    await page.goto("/memories");
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Caption").fill("E2E photo memory");
    await dialog.getByLabel("Album", { exact: true }).fill("E2E Album");
    await dialog.getByLabel("Photo or video (up to 10 MB)").setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("img", { name: "E2E photo memory" }),
    ).toBeVisible();
    await expect(
      page.getByRole("article").filter({ hasText: "E2E photo memory" }),
    ).toContainText("E2E Album");
  });
  test("persists appearance preferences and disables a family tool", async ({
    page,
  }) => {
    await page.goto("/settings/appearance");
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Preferences saved.");
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.goto("/admin/tools");
    const form = page
      .locator("form")
      .filter({ has: page.getByLabel("Enable contacts", { exact: true }) });
    await form.getByLabel("Enable contacts", { exact: true }).uncheck();
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form.getByRole("status")).toContainText("Changes saved.");
    await page.goto("/contacts");
    await expect(
      page.getByRole("heading", { name: "Tool unavailable" }),
    ).toBeVisible();
    await page.goto("/admin/tools");
    const restore = page
      .locator("form")
      .filter({ has: page.getByLabel("Enable contacts", { exact: true }) });
    await restore.getByLabel("Enable contacts", { exact: true }).check();
    await restore.getByRole("button", { name: "Save", exact: true }).click();
    await expect(restore.getByRole("status")).toContainText("Changes saved.");
    await page.goto("/contacts");
    await expect(
      page.getByRole("heading", { name: "Contacts", exact: true }),
    ).toBeVisible();
  });
});
