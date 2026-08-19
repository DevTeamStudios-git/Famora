import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/integration/mocks/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/integration/**/*.test.ts"],
    globals: true,
    pool: "threads",
    fileParallelism: false,
    setupFiles: ["./vitest.integration.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});