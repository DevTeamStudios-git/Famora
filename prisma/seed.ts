/**
 * Famora — database seed (Prisma workflow).
 *
 * Equivalent to supabase/seed.sql. Seeds:
 *  1. the initial Famora family + settings + default feature flags,
 *  2. the hard access whitelist (§40) from SEED_WHITELIST,
 *  3. the permission registry and default role→permission matrix.
 *
 * Run:  pnpm prisma db seed
 * Env:  requires DIRECT_URL (see .env / prisma.config.ts).
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  FAMORA_SEED_FAMILY_ID,
  FAMORA_SEED_FAMILY_NAME,
} from "../src/lib/config";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  DEFAULT_ROLE_PERMISSIONS,
  type PermissionKey,
} from "../src/lib/authorization/permissions";
import { SEED_WHITELIST } from "../src/lib/authorization/whitelist";
import { normalizeEmail } from "../src/lib/utils";

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL is required to seed the database.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const FEATURE_KEYS = [
  "chat",
  "dms",
  "tasks",
  "notebook",
  "files",
  "polls",
  "contacts",
  "recipes",
  "memories",
  "announcements",
  "tools",
] as const;

async function main() {
  // 1. Family + settings + features --------------------------------------------
  const family = await prisma.family.upsert({
    where: { id: FAMORA_SEED_FAMILY_ID },
    update: {},
    create: {
      id: FAMORA_SEED_FAMILY_ID,
      name: FAMORA_SEED_FAMILY_NAME,
      description: "The Famora family space",
    },
  });

  await prisma.familySettings.upsert({
    where: { familyId: family.id },
    update: {},
    create: { familyId: family.id, timezone: "UTC", defaultLanguage: "en" },
  });

  await prisma.familyFeature.createMany({
    data: FEATURE_KEYS.map((key) => ({ familyId: family.id, key, enabled: true })),
    skipDuplicates: true,
  });

  // 2. Whitelist (§40) -----------------------------------------------------------
  for (const entry of SEED_WHITELIST) {
    await prisma.familyWhitelistEntry.upsert({
      where: {
        familyId_email: { familyId: family.id, email: normalizeEmail(entry.email) },
      },
      update: {},
      create: {
        familyId: family.id,
        email: normalizeEmail(entry.email),
        internalRole: entry.internalRole,
        status: "ACTIVE",
      },
    });
  }

  // 3. Permissions + role matrix ---------------------------------------------------
  for (const key of Object.keys(PERMISSIONS) as PermissionKey[]) {
    const group =
      Object.keys(PERMISSION_GROUPS).find(
        (g) => PERMISSION_GROUPS[g].includes(key),
      ) ?? null;
    await prisma.permission.upsert({
      where: { key },
      update: { group, description: PERMISSIONS[key] },
      create: { key, group, description: PERMISSIONS[key] },
    });
  }

  for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as Array<
    keyof typeof DEFAULT_ROLE_PERMISSIONS
  >) {
    const permissions = DEFAULT_ROLE_PERMISSIONS[role];
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        update: {},
        create: { role, permission },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`  family:      ${family.name} (${family.id})`);
  console.log(`  whitelist:   ${SEED_WHITELIST.length} entries`);
  console.log(`  permissions: ${Object.keys(PERMISSIONS).length} keys`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });