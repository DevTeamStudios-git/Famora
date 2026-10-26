import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  memoNativeRequest,
  nativeAccessToken,
  withNativeAuth,
} from "./native-context";

it("keeps concurrent bearer identities and memoized authorization isolated", async () => {
  const resolve = vi.fn(async () => {
    await Promise.resolve();
    return nativeAccessToken();
  });
  const results = await Promise.all(
    ["first-session", "second-session"].map((token) =>
      withNativeAuth(token, async () => {
        const first = memoNativeRequest("access", resolve);
        const second = memoNativeRequest("access", resolve);
        expect(first).toBe(second);
        return Promise.all([first, second]);
      }),
    ),
  );
  expect(results).toEqual([
    ["first-session", "first-session"],
    ["second-session", "second-session"],
  ]);
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(nativeAccessToken()).toBeUndefined();
});

it("does not reuse authorization or bearer tokens across requests", async () => {
  const resolve = vi.fn(async () => nativeAccessToken());
  await withNativeAuth("revoked-token", () =>
    memoNativeRequest("access", resolve),
  );
  expect(
    await withNativeAuth("fresh-token", () =>
      memoNativeRequest("access", resolve),
    ),
  ).toBe("fresh-token");
  expect(resolve).toHaveBeenCalledTimes(2);
});
