// Realtime authorization integration tests.
//
// These run against the *live* Supabase project (configured via .env) so they
// exercise the real Realtime server: publication membership, RLS checks with
// real subscriber JWTs, and the Postgres WAL -> client event pipeline.
//
// Run with: pnpm test:integration
// They are skipped automatically when .env credentials are missing (CI).

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

import { env as nextEnv } from "@/lib/env";
import {
  listFamilyMessages,
  getFamilyMessage,
  type ChatMessage,
} from "@/server/queries/chat";

const URL = nextEnv.NEXT_PUBLIC_SUPABASE_URL;
const ANON = nextEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = nextEnv.SUPABASE_SERVICE_ROLE_KEY;
const DIRECT_URL = nextEnv.DIRECT_URL;

const hasEnv = Boolean(URL && ANON && SR && DIRECT_URL && URL.startsWith("http"));

const admin = createClient(URL, SR);

const pg = new Client({ connectionString: DIRECT_URL });

const createdUserIds: string[] = [];
const createdFamilyIds: string[] = [];

async function signIn(email: string): Promise<{
  client: SupabaseClient;
  userId: string;
}> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: email.split("@")[0] },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashedToken = link.data.properties?.hashed_token;
  if (!hashedToken) throw new Error("generateLink returned no hashed_token");
  const { data: ver, error: verifyError } = await createClient(URL, ANON).auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });
  if (verifyError || !ver.session) {
    throw new Error(`verifyOtp failed: ${verifyError?.message}`);
  }

  const client = createClient(URL, ANON);
  await client.auth.setSession({
    access_token: ver.session.access_token,
    refresh_token: ver.session.refresh_token,
  });
  return { client, userId: data.user.id };
}

async function createFamily(name: string): Promise<string> {
  const id = randomUUID();
  await pg.query(`insert into families (id, name) values ($1, $2)`, [id, name]);
  createdFamilyIds.push(id);
  return id;
}

async function createConversation(familyId: string, type = "FAMILY_CHAT"): Promise<string> {
  const id = randomUUID();
  await pg.query(
    `insert into conversations (id, "familyId", type) values ($1, $2, $3)`,
    [id, familyId, type],
  );
  return id;
}

async function addMember(params: {
  userId: string;
  familyId: string;
  conversationId: string;
  internalRole: "FAMILY_CHIEF" | "CO_FAMILY_CHIEF" | "MEMBER" | "HIDDEN_ADMIN";
  status?: "ACTIVE" | "DISABLED" | "REMOVED" | "PENDING";
}): Promise<string> {
  const { userId, familyId, conversationId, internalRole, status = "ACTIVE" } = params;
  await pg.query(
    `insert into users (id, email, "displayName") values ($1, $2, $3)
     on conflict (id) do update set "displayName" = excluded."displayName"`,
    [userId, `test-${userId.slice(0, 8)}@famora.test`, `T-${userId.slice(0, 6)}`],
  );
  const memberId = randomUUID();
  await pg.query(
    `insert into family_members (id, "familyId", "userId", "internalRole", "displayRole", status)
     values ($1, $2, $3, $4, 'MEMBER', $5)`,
    [memberId, familyId, userId, internalRole, status],
  );
  await pg.query(
    `insert into conversation_members (id, "conversationId", "memberId") values ($1, $2, $3)`,
    [randomUUID(), conversationId, memberId],
  );
  return memberId;
}

async function insertMessage(input: {
  conversationId: string;
  senderMemberId: string;
  body: string;
}): Promise<string> {
  const id = randomUUID();
  await pg.query(
    `insert into messages (id, "conversationId", "senderMemberId", type, body)
     values ($1, $2, $3, 'TEXT', $4) returning id`,
    [id, input.conversationId, input.senderMemberId, input.body],
  );
  return id;
}

async function subscribePostgres(
  client: SupabaseClient,
  topic: string,
  table: string,
  filter?: string,
): Promise<{ channel: ReturnType<SupabaseClient["channel"]>; events: unknown[] }> {
  const events: unknown[] = [];
  const channel = client.channel(topic);
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
    (payload) => events.push(payload),
  );
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`subscribe ${status}`));
    });
  });
  await delay(750);
  return { channel, events };
}

/**
 * Joins a *private* broadcast channel (Realtime Authorization): membership is
 * gated by RLS policies on `realtime.messages`, not by table grants. Resolves
 * on SUBSCRIBED (authorized) or on the server's rejection (CHANNEL_ERROR),
 * whichever comes first, capped at 12s.
 */
async function subscribePrivate(
  client: SupabaseClient,
  topic: string,
  listenEvent: string,
): Promise<{ channel: ReturnType<SupabaseClient["channel"]>; events: unknown[]; statuses: string[] }> {
  const events: unknown[] = [];
  const statuses: string[] = [];
  const channel = client.channel(topic, { config: { private: true } });
  channel.on("broadcast", { event: listenEvent }, (payload) => events.push(payload));
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const cap = setTimeout(finish, 12_000);
    channel.subscribe((status, err) => {
      statuses.push(status + (err ? ":" + (err.message ?? "") : ""));
      if (status === "SUBSCRIBED") setTimeout(finish, 1_000);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(cap);
        finish();
      }
    });
  });
  return { channel, events, statuses };
}

type TypingBroadcast = {
  conversationId: string;
  memberId: string;
  displayName: string;
  isTyping: boolean;
};

function sendTypingBroadcast(target: ReturnType<SupabaseClient["channel"]>, payload: TypingBroadcast) {
  target.send({ type: "broadcast", event: "typing", payload });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!hasEnv)("Realtime authorization", () => {
  let familyA: string;
  let familyB: string;
  let convA: string;
  let convB: string;

  beforeAll(async () => {
    if (!hasEnv) return;
    await pg.connect();
    familyA = await createFamily(`RT-A-${Date.now()}`);
    familyB = await createFamily(`RT-B-${Date.now()}`);
    convA = await createConversation(familyA);
    convB = await createConversation(familyB);
  });

  afterAll(async () => {
    if (!hasEnv) return;
    for (const uid of createdUserIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
    for (const fid of createdFamilyIds) {
      await pg.query(`delete from families where id = $1`, [fid]).catch(() => {});
    }
    await pg.end();
  });

  it("active member receives messages from their family conversation", async () => {
    const a = await signIn(`a-${randomUUID()}@famora.test`);
    const memberA = await addMember({ userId: a.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER" });
    const { channel, events } = await subscribePostgres(a.client, `family:${familyA}:chat`, "messages", `conversationId=eq.${convA}`);
    // The first WAL event can lag the SUBSCRIBED ack by a beat; keep sending
    // (each insert is its own event) until one arrives or the budget runs out.
    const ids: string[] = [];
    const deadline = Date.now() + 20_000;
    while (events.length === 0 && Date.now() < deadline) {
      ids.push(await insertMessage({ conversationId: convA, senderMemberId: memberA, body: `ping ${ids.length + 1}` }));
      await delay(1_500);
    }
    await channel.unsubscribe();
    expect(events.length).toBeGreaterThan(0);
    const ev = events[0] as { new?: { id?: string } };
    expect(ids).toContain(ev.new?.id);
  });

  it("member does NOT receive another family's messages", async () => {
    const a = await signIn(`ax-${randomUUID()}@famora.test`);
    const memberA = await addMember({ userId: a.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER" });
    const { channel, events } = await subscribePostgres(a.client, `family:${familyA}:chat`, "messages", `conversationId=eq.${convB}`);
    await insertMessage({ conversationId: convB, senderMemberId: memberA, body: "family B only" });
    await delay(5_000);
    await channel.unsubscribe();
    expect(events.length).toBe(0);
  });

  it("inactive member does NOT receive messages", async () => {
    const a = await signIn(`in-${randomUUID()}@famora.test`);
    const memberA = await addMember({ userId: a.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER", status: "DISABLED" });
    const { channel, events } = await subscribePostgres(a.client, `family:${familyA}:chat`, "messages", `conversationId=eq.${convA}`);
    await insertMessage({ conversationId: convA, senderMemberId: memberA, body: "should not be seen" });
    await delay(5_000);
    await channel.unsubscribe();
    expect(events.length).toBe(0);
  });

  it("non-member does NOT receive messages", async () => {
    const stranger = await signIn(`nm-${randomUUID()}@famora.test`);
    const { channel, events } = await subscribePostgres(stranger.client, `family:${familyA}:chat`, "messages", `conversationId=eq.${convA}`);
    const sender = await signIn(`ns-${randomUUID()}@famora.test`);
    const senderMember = await addMember({ userId: sender.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER" });
    await insertMessage({ conversationId: convA, senderMemberId: senderMember, body: "stranger should not see" });
    await delay(5_000);
    await channel.unsubscribe();
    expect(events.length).toBe(0);
  });

  it("hidden admin receives messages normally", async () => {
    const ha = await signIn(`ha-${randomUUID()}@famora.test`);
    const memberHA = await addMember({ userId: ha.userId, familyId: familyA, conversationId: convA, internalRole: "HIDDEN_ADMIN" });
    const { channel, events } = await subscribePostgres(ha.client, `family:${familyA}:chat`, "messages", `conversationId=eq.${convA}`);
    const ids: string[] = [];
    const deadline = Date.now() + 20_000;
    while (events.length === 0 && Date.now() < deadline) {
      ids.push(await insertMessage({ conversationId: convA, senderMemberId: memberHA, body: `hidden admin sees ${ids.length + 1}` }));
      await delay(1_500);
    }
    await channel.unsubscribe();
    expect(events.length).toBeGreaterThan(0);
    const ev = events[0] as { new?: { id?: string } };
    void ev;
    expect(ids).toContain(ev.new?.id);
  });

  it("hidden admin internal role is never projected to the client", async () => {
    const ha = await signIn(`hap-${randomUUID()}@famora.test`);
    const memberHA = await addMember({ userId: ha.userId, familyId: familyA, conversationId: convA, internalRole: "HIDDEN_ADMIN" });
    const id = await insertMessage({ conversationId: convA, senderMemberId: memberHA, body: "projection check" });
    const message: ChatMessage | null = await getFamilyMessage(id, memberHA);
    expect(message).not.toBeNull();
    // Server projection exposes only the safe shape: id/displayRole/user.
    expect(message!.sender).toEqual(
      expect.objectContaining({ memberId: memberHA, displayName: expect.any(String), avatarUrl: null }),
    );
    expect(message!.sender).not.toHaveProperty("internalRole");
    expect(message!.sender).not.toHaveProperty("userId");
  });

  it("reactions respect conversation membership", async () => {
    const a = await signIn(`ra-${randomUUID()}@famora.test`);
    await addMember({ userId: a.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER" });
    const { channel, events } = await subscribePostgres(a.client, "family:rt:reactions", "message_reactions");
    const other = await signIn(`rb-${randomUUID()}@famora.test`);
    const memberB = await addMember({ userId: other.userId, familyId: familyB, conversationId: convB, internalRole: "MEMBER" });
    const msgB = await insertMessage({ conversationId: convB, senderMemberId: memberB, body: "react in B" });
    await pg.query(
      `insert into message_reactions (id, "messageId", "memberId", emoji) values (gen_random_uuid(), $1, $2, '👍')`,
      [msgB, memberB],
    );
    await delay(5_000);
    await channel.unsubscribe();
    expect(events.length).toBe(0);
  });

  it("pins respect conversation membership", async () => {
    const a = await signIn(`pa-${randomUUID()}@famora.test`);
    await addMember({ userId: a.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER" });
    const { channel, events } = await subscribePostgres(a.client, "family:rt:pins", "pinned_messages");
    const other = await signIn(`pb-${randomUUID()}@famora.test`);
    const memberB = await addMember({ userId: other.userId, familyId: familyB, conversationId: convB, internalRole: "MEMBER" });
    const msgB = await insertMessage({ conversationId: convB, senderMemberId: memberB, body: "pin in B" });
    await pg.query(
      `insert into pinned_messages (id, "messageId", "memberId") values (gen_random_uuid(), $1, $2)`,
      [msgB, memberB],
    );
    await delay(5_000);
    await channel.unsubscribe();
    expect(events.length).toBe(0);
  });

  it("reconnect reconciles messages missed while disconnected", async () => {
    const a = await signIn(`rc-a-${randomUUID()}@famora.test`);
    const b = await signIn(`rc-b-${randomUUID()}@famora.test`);
    const memberA = await addMember({ userId: a.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER" });
    const memberB = await addMember({ userId: b.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER" });

    // B connects and sees the initial state.
    const bSub = await subscribePostgres(b.client, `family:${familyA}:chat`, "messages", `conversationId=eq.${convA}`);
    void (bSub.channel);
    await delay(1_000);

    // B goes offline.
    await bSub.channel.unsubscribe();
    await delay(500);

    // A sends 3 messages while B is away.
    const sent: string[] = [];
    for (let i = 1; i <= 3; i++) {
      sent.push(await insertMessage({ conversationId: convA, senderMemberId: memberA, body: `missed message ${i}` }));
    }

    // B reconnects and reconciles the same way the component's
    // on-connect resync does (fetchRecentMessages -> listFamilyMessages).
    const reconciled = await listFamilyMessages(convA, memberB);
    const ids = reconciled.map((m) => m.id);
    for (const id of sent) expect(ids).toContain(id);
    expect(reconciled.length).toBeGreaterThanOrEqual(sent.length);
    expect(reconciled.find((m) => m.id === sent[0])?.body).toBe("missed message 1");
  });

  it("member joins the private channel and receives typing broadcasts", async () => {
    const a = await signIn(`bp-a-${randomUUID()}@famora.test`);
    const b = await signIn(`bp-b-${randomUUID()}@famora.test`);
    await addMember({ userId: a.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER" });
    await addMember({ userId: b.userId, familyId: familyA, conversationId: convA, internalRole: "MEMBER" });
    const topic = `family:${familyA}:chat`;

    const sender = await subscribePrivate(a.client, topic, "typing");
    const receiver = await subscribePrivate(b.client, topic, "typing");
    expect(sender.statuses.some((s) => s.startsWith("SUBSCRIBED"))).toBe(true);
    expect(receiver.statuses.some((s) => s.startsWith("SUBSCRIBED"))).toBe(true);

    sendTypingBroadcast(sender.channel, {
      conversationId: convA,
      memberId: `bm-${randomUUID()}`,
      displayName: "Banner",
      isTyping: true,
    });
    const deadline = Date.now() + 10_000;
    while (receiver.events.length === 0 && Date.now() < deadline) await delay(250);
    await sender.channel.unsubscribe();
    await receiver.channel.unsubscribe();
    expect(receiver.events.length).toBeGreaterThan(0);
    const ev = receiver.events[0] as { payload?: TypingBroadcast };
    expect(ev.payload?.isTyping).toBe(true);
  });

  it("non-member cannot join the private channel", async () => {
    const outsider = await signIn(`bp-s-${randomUUID()}@famora.test`);
    const { channel, events, statuses } = await subscribePrivate(
      outsider.client,
      `family:${familyA}:chat`,
      "typing",
    );
    await channel.unsubscribe();
    expect(events.length).toBe(0);
    expect(statuses.some((s) => s.startsWith("SUBSCRIBED"))).toBe(false);
    expect(statuses.some((s) => s.startsWith("CHANNEL_ERROR"))).toBe(true);
  });

  it("member cannot join another family's private channel", async () => {
    const other = await signIn(`bp-o-${randomUUID()}@famora.test`);
    await addMember({ userId: other.userId, familyId: familyB, conversationId: convB, internalRole: "MEMBER" });

    // Allowed on its own family's topic…
    const own = await subscribePrivate(other.client, `family:${familyB}:chat`, "typing");
    expect(own.statuses.some((s) => s.startsWith("SUBSCRIBED"))).toBe(true);

    // …but denied on family A's.
    const foreign = await subscribePrivate(other.client, `family:${familyA}:chat`, "typing");
    await own.channel.unsubscribe();
    await foreign.channel.unsubscribe();
    expect(foreign.events.length).toBe(0);
    expect(foreign.statuses.some((s) => s.startsWith("CHANNEL_ERROR"))).toBe(true);
  });
});