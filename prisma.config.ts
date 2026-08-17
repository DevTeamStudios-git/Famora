import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Used by CLI commands (migrate/dev/studio/db push). Migration and schema
    // operations use the direct connection to avoid Supabase pooler limits.
    url: env("DIRECT_URL"),
  },
});