import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import setup from "../e2e-auth/setup";
import teardown from "../e2e-auth/teardown";

config({ quiet: true });
process.env.FAMORA_FAMILY_ID = randomUUID();
process.env.FAMORA_NATIVE_E2E = "1";
let server: ChildProcess | undefined;
await new Promise<void>((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () => reject(new Error("Port 3100 is already in use. Stop the other test server before running native E2E tests.")));
  probe.listen(3100, "127.0.0.1", () => probe.close(() => resolve()));
});
try {
  await setup();
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3100"], {
    env: { ...process.env, FAMORA_E2E: "1" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  // Keep server output out of credentials-bearing traces; report only readiness/errors.
  server.stdout?.resume(); server.stderr?.resume();
  const deadline = Date.now() + 180000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error("The isolated native test backend exited before readiness.");
    try { const response = await fetch("http://localhost:3100/login", { signal: AbortSignal.timeout(5000) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("The isolated native test backend did not become ready.");
  console.log("Disposable authenticated family and native test backend are ready.");
  const test = spawn(process.execPath, ["scripts/android-test.mjs", "--authenticated"], { stdio: "inherit", windowsHide: true });
  const status = await new Promise<number>((resolve, reject) => { test.once("error", reject); test.once("exit", code => resolve(code ?? 1)); });
  if (status) throw new Error("Authenticated Android workflow verification failed.");
} finally {
  if (server?.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else server.kill();
  }
  await teardown();
}
