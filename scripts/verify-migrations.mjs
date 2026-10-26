// Replay Prisma DDL in a disposable schema and roll it back, including on error.
import { config } from "dotenv";
import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
config({ quiet: true });
async function main() {
  const database = new Client({
    connectionString: process.env.DIRECT_URL,
    connectionTimeoutMillis: 15000,
  });
  await database.connect();
  try {
    await database.query("BEGIN");
    const schema = `famora_migration_test_${randomUUID().replaceAll("-", "")}`;
    await database.query(`CREATE SCHEMA "${schema}"`);
    await database.query(`SET LOCAL search_path TO "${schema}"`);
    const directory = path.join(process.cwd(), "prisma", "migrations");
    const migrations = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of migrations) {
      const sql = await readFile(
        path.join(directory, entry.name, "migration.sql"),
        "utf8",
      );
      if (/\bpublic\./i.test(sql))
        throw new Error(`Refusing schema-qualified DDL in ${entry.name}`);
      await database.query(sql);
    }
    const tables = await database.query(
      "SELECT count(*)::int AS total FROM information_schema.tables WHERE table_schema = $1",
      [schema],
    );
    const columns = await database.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='calendar_events'",
      [schema],
    );
    for (const name of [
      "calendarId",
      "version",
      "timeZone",
      "recurrenceExceptions",
    ])
      if (!columns.rows.some((row) => row.column_name === name))
        throw new Error(`Calendar migration is missing ${name}`);
    console.log(
      `Replayed ${migrations.length} Prisma migrations successfully (${tables.rows[0].total} tables). All test DDL rolled back.`,
    );
  } finally {
    await database.query("ROLLBACK").catch(() => {});
    await database.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
