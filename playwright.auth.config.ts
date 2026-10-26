import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
config({ quiet: true });
process.env.FAMORA_FAMILY_ID ??= randomUUID();
export default defineConfig({
  testDir: "./e2e-auth",
  globalSetup: "./e2e-auth/setup.ts",
  globalTeardown: "./e2e-auth/teardown.ts",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3100",
    storageState: "e2e/.auth/state.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec next dev --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: { FAMORA_E2E: "1", FAMORA_FAMILY_ID: process.env.FAMORA_FAMILY_ID },
  },
});
