import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { readFile, rm } from "node:fs/promises";
export default async function teardown() {
  let fixture: { familyId: string; userIds: string[] };
  try {
    fixture = JSON.parse(await readFile("e2e/.auth/fixture.json", "utf8"));
  } catch {
    return;
  }
  if (
    fixture.familyId !== process.env.FAMORA_FAMILY_ID ||
    fixture.familyId === "00000000-0000-4000-8000-000000000001"
  )
    throw new Error("Refusing to clean up an unrecognized family.");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  for (const kind of ["files", "memories", "chat"]) {
    const prefix = `${fixture.familyId}/${kind}`;
    const { data, error } = await admin.storage.from("families").list(prefix);
    if (error) throw new Error("Could not inspect test storage for cleanup.");
    const paths =
      data?.filter((item) => item.id).map((item) => `${prefix}/${item.name}`) ??
      [];
    if (paths.length) {
      const { error } = await admin.storage.from("families").remove(paths);
      if (error) throw error;
    }
  }
  const database = new Client({
    connectionString: process.env.DIRECT_URL,
    connectionTimeoutMillis: 15000,
  });
  for (const userId of fixture.userIds) {
    const prefix = `users/${userId}`;
    const { data, error } = await admin.storage.from("avatars").list(prefix);
    if (error) throw error;
    const paths = (data ?? [])
      .filter((item) => item.id)
      .map((item) => `${prefix}/${item.name}`);
    if (paths.length) {
      const { error } = await admin.storage.from("avatars").remove(paths);
      if (error) throw error;
    }
  }
  await database.connect();
  try {
    await database.query("DELETE FROM families WHERE id=$1 AND name=$2", [
      fixture.familyId,
      "Famora automated test family",
    ]);
    await database.query('DELETE FROM file_blobs WHERE "familyId"=$1', [
      fixture.familyId,
    ]);
    await database.query(
      "DELETE FROM users WHERE id = ANY($1::uuid[]) AND email LIKE $2",
      [fixture.userIds, "famora-e2e-%@example.test"],
    );
  } finally {
    await database.end();
  }
  for (const id of fixture.userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  await rm("e2e/.auth/state.json", { force: true });
  await rm("e2e/.auth/native-session.json", { force: true });
  if (process.env.FAMORA_NATIVE_E2E === "1")
    await rm("test-results/native-session.json", { force: true });
  await rm("e2e/.auth/fixture.json", { force: true });
}
