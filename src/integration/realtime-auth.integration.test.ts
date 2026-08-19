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
    const id = await insertMessage({ conversationId: convA, senderMemberId: memberA, body: "hello family A" });
    const deadline = Date.now() + 10_000;
    while (events.length === 0 && Date.now() < deadline) await delay(250);
    await channel.unsubscribe();
    expect(events.length).toBeGreaterThan(0);
    const ev = events[0] as { new?: { id?: string; body?: string } };
    expect(ev.new?.id).toBe(id);
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
    const id = await insertMessage({ conversationId: convA, senderMemberId: memberHA, body: "hidden admin sees this" });
    const deadline = Date.now() + 10_000;
    while (events.length === 0 && Date.now() < deadline) await delay(250);
    await channel.unsubscribe();
    void id;
    expect(events.length).toBeGreaterThan(0);
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
});