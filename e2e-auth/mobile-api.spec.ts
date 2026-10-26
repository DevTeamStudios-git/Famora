import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

type Fixture = {
  session: { access_token: string };
  memberSession: { access_token: string };
};
const fixture = async () =>
  JSON.parse(
    await readFile("e2e/.auth/native-session.json", "utf8"),
  ) as Fixture;
const headersFor = (token: string) => ({ Authorization: `Bearer ${token}` });
async function body(request: APIRequestContext, path: string, token: string) {
  const response = await request.get(`/api/mobile/${path}`, {
    headers: headersFor(token),
  });
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["cache-control"]).toContain("no-store");
  return response.json();
}

test.describe.serial("native bearer API", () => {
  test("requires a verified bearer token even when browser cookies are authenticated", async ({
    request,
  }) => {
    const config = await request.get("/api/mobile/config");
    expect(config.ok()).toBeTruthy();
    const publicConfig = await config.json();
    expect(Object.keys(publicConfig).sort()).toEqual([
      "supabaseKey",
      "supabaseUrl",
    ]);
    for (const token of [null, "forged.invalid.jwt"]) {
      const response = await request.get("/api/mobile/session", {
        headers: token ? headersFor(token) : {},
      });
      expect(response.status()).toBe(401);
      expect(response.headers()["content-type"]).toContain("application/json");
    }
  });

  test("shares persisted tasks, search, calendar and messages with the web backend", async ({
    request,
  }) => {
    const { session } = await fixture();
    const token = session.access_token;
    const profile = await body(request, "session", token);
    expect(profile.user.displayName).toMatch(/^Test Chief/);
    expect(profile.modules.tasks.fields).toEqual(expect.any(Array));
    expect(JSON.stringify(profile)).not.toContain('"internalRole"');
    const title = `Native API task ${randomUUID()}`;
    let response = await request.post("/api/mobile/workspace/tasks", {
      headers: headersFor(token),
      multipart: {
        title,
        description: "Native and web share this persisted record",
        priority: "HIGH",
        status: "TODO",
      },
    });
    expect((await response.json()).error).toBeUndefined();
    let tasks = await body(request, "workspace/tasks", token);
    const task = tasks.items.find(
      (item: { title: string }) => item.title === title,
    );
    expect(task.id).toBeTruthy();
    response = await request.post(`/api/mobile/workspace/tasks/${task.id}`, {
      headers: headersFor(token),
      multipart: {
        title,
        description: "Updated from native",
        priority: "HIGH",
        status: "COMPLETED",
      },
    });
    expect((await response.json()).error).toBeUndefined();
    tasks = await body(request, "workspace/tasks", token);
    expect(
      tasks.items.find((item: { id: string }) => item.id === task.id).values
        .status,
    ).toBe("COMPLETED");
    const found = await body(
      request,
      `search?q=${encodeURIComponent(title)}`,
      token,
    );
    expect(
      found.some((item: { id: string }) => item.id === task.id),
    ).toBeTruthy();
    expect(await body(request, "agenda-meta", token)).toEqual({
      categories: expect.any(Array),
      members: expect.any(Array),
    });
    const startAt = new Date(Date.now() + 86400000).toISOString();
    const endAt = new Date(Date.now() + 90000000).toISOString();
    response = await request.post("/api/mobile/action", {
      headers: headersFor(token),
      data: {
        action: "event-create",
        data: {
          title: "Native API event",
          startAt,
          endAt,
          visibility: "FAMILY",
          timeZone: "America/Toronto",
        },
      },
    });
    const created = await response.json();
    expect(created.ok).toBe(true);
    expect(created.data.id).toBeTruthy();
    response = await request.post("/api/mobile/action", {
      headers: headersFor(token),
      data: {
        action: "event-detail",
        id: created.data.id,
        value: "comment",
        data: { body: "Native API comment" },
      },
    });
    expect((await response.json()).error).toBeUndefined();
    const details = await body(request, `event/${created.data.id}`, token);
    expect(
      details.comments.some(
        (item: { body: string }) => item.body === "Native API comment",
      ),
    ).toBeTruthy();
    response = await request.post("/api/mobile/action", {
      headers: headersFor(token),
      data: { action: "chat-send", data: { body: "Hello from native API" } },
    });
    expect((await response.json()).ok).toBe(true);
    const chat = await body(request, "chat", token);
    expect(
      chat.messages.some(
        (item: { body: string }) => item.body === "Hello from native API",
      ),
    ).toBeTruthy();
    response = await request.delete(`/api/mobile/workspace/tasks/${task.id}`, {
      headers: headersFor(token),
    });
    expect((await response.json()).error).toBeUndefined();
    response = await request.post("/api/mobile/action", {
      headers: headersFor(token),
      data: { action: "event-delete", id: created.data.id },
    });
    expect((await response.json()).ok).toBe(true);
  });

  test("enforces member permissions, record ownership and immediate access revocation", async ({
    request,
  }) => {
    const { session, memberSession } = await fixture();
    const chief = session.access_token,
      member = memberSession.access_token;
    let response = await request.get("/api/mobile/admin/roles", {
      headers: headersFor(member),
    });
    expect(response.status()).toBe(403);
    response = await request.get(`/api/mobile/dms/${randomUUID()}`, {
      headers: headersFor(member),
    });
    expect(response.status()).toBe(404);
    response = await request.post("/api/mobile/admin/family", {
      headers: headersFor(member),
      multipart: { name: "Unauthorized change", timezone: "UTC" },
    });
    expect(response.status()).toBe(403);
    const own = await body(request, "session", member);
    const admin = await body(request, "admin/access", chief);
    const change = admin.forms.find(
      (form: { action: string; title: string }) =>
        form.action === "access" && form.title.includes(own.user.email),
    );
    expect(change).toBeTruthy();
    try {
      response = await request.post("/api/mobile/admin/access", {
        headers: headersFor(chief),
        multipart: {
          id: change.values.id,
          status: "DISABLED",
          confirmation: "CONFIRM",
        },
      });
      expect((await response.json()).error).toBeUndefined();
      response = await request.get("/api/mobile/session", {
        headers: headersFor(member),
      });
      expect(response.status()).toBe(403);
    } finally {
      await request.post("/api/mobile/admin/access", {
        headers: headersFor(chief),
        multipart: {
          id: change.values.id,
          status: "ACTIVE",
          confirmation: "CONFIRM",
        },
      });
    }
  });
});
