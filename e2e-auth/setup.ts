import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export default async function setup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const familyId = process.env.FAMORA_FAMILY_ID!;
  if (!familyId || familyId === "00000000-0000-4000-8000-000000000001")
    throw new Error("Refusing to run authenticated tests in the real family.");
  await mkdir("e2e/.auth", { recursive: true });
  const fixture = { familyId, userIds: [] as string[] };
  await writeFile("e2e/.auth/fixture.json", JSON.stringify(fixture));
  const database = new Client({
    connectionString: process.env.DIRECT_URL,
    connectionTimeoutMillis: 15000,
  });
  await database.connect();
  try {
    await database.query("INSERT INTO families (id, name) VALUES ($1, $2)", [
      familyId,
      "Famora automated test family",
    ]);
    let primarySession: { access_token: string; refresh_token: string } | null =
      null;
    let memberSession: { access_token: string; refresh_token: string } | null =
      null;
    for (let index = 0; index < 2; index++) {
      const email = `famora-e2e-${randomUUID()}@example.test`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: index === 0 ? "Test Chief" : "Test Member",
        },
      });
      if (error || !data.user)
        throw new Error(`Cannot create test identity: ${error?.message}`);
      fixture.userIds.push(data.user.id);
      await writeFile("e2e/.auth/fixture.json", JSON.stringify(fixture));
      const role = index === 0 ? "FAMILY_CHIEF" : "MEMBER";
      await database.query(
        'INSERT INTO family_whitelist (id, "familyId", email, "internalRole") VALUES ($1, $2, $3, $4)',
        [randomUUID(), familyId, email, role],
      );
      await database.query(
        'INSERT INTO users (id, email, "displayName") VALUES ($1,$2,$3)',
        [data.user.id, email, index === 0 ? "Test Chief" : "Test Member"],
      );
      await database.query(
        'INSERT INTO family_members (id,"familyId","userId","internalRole","displayRole") VALUES ($1,$2,$3,$4::text::internal_role,$4::text::display_role)',
        [randomUUID(), familyId, data.user.id, role],
      );
      {
        const link = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
        const token = link.data.properties?.hashed_token;
        if (!token) throw new Error("Cannot generate test sign-in.");
        const signed = await createClient(url, anon, {
          auth: { persistSession: false, autoRefreshToken: false },
        }).auth.verifyOtp({ type: "magiclink", token_hash: token });
        if (signed.error || !signed.data.session)
          throw new Error(
            `Cannot sign in test identity: ${signed.error?.message}`,
          );
        if (index === 0) primarySession = signed.data.session;
        else memberSession = signed.data.session;
      }
    }
    if (!primarySession) throw new Error("Test session missing.");
    await writeFile(
      "e2e/.auth/native-session.json",
      JSON.stringify({
        storageKey: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`,
        session: primarySession,
        memberSession,
        apiBase: "http://10.0.2.2:3100",
      }),
    );
    if (process.env.FAMORA_NATIVE_E2E === "1") {
      await mkdir("test-results", { recursive: true });
      await writeFile(
        "test-results/native-session.json",
        await import("node:fs/promises").then((fs) =>
          fs.readFile("e2e/.auth/native-session.json"),
        ),
      );
    }
    const cookieJar = new Map<
      string,
      {
        name: string;
        value: string;
        domain: string;
        path: string;
        httpOnly: boolean;
        secure: boolean;
        sameSite: "Lax";
        expires: number;
      }
    >();
    const client = createServerClient(url, anon, {
      cookies: {
        getAll: () => [...cookieJar.values()],
        setAll: (cookies) => {
          for (const cookie of cookies)
            cookieJar.set(cookie.name, {
              name: cookie.name,
              value: cookie.value,
              domain: "localhost",
              path: "/",
              httpOnly: false,
              secure: false,
              sameSite: "Lax",
              expires: -1,
            });
        },
      },
    });
    const session = await client.auth.setSession(primarySession);
    if (session.error)
      throw new Error("Could not prepare the test browser session.");
    await writeFile(
      "e2e/.auth/state.json",
      JSON.stringify({ cookies: [...cookieJar.values()], origins: [] }),
    );
  } finally {
    await database.end();
  }
}
