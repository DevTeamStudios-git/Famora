import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  oauth: vi.fn(),
  configured: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signInWithOAuth: mocks.oauth } }),
}));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://misconfigured.example" },
  isSupabaseConfigured: mocks.configured,
}));
import LoginPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.oauth.mockResolvedValue({ error: null });
});

it("uses the current browser origin for the Google PKCE callback", async () => {
  render(<LoginPage />);
  await userEvent.click(
    screen.getByRole("button", { name: "Continue with Google" }),
  );
  expect(mocks.oauth).toHaveBeenCalledWith({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
});

it("keeps network failures retryable without redirecting to setup", async () => {
  mocks.oauth.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(<LoginPage />);
  const button = screen.getByRole("button", { name: "Continue with Google" });
  await userEvent.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check your connection",
  );
  expect(mocks.push).not.toHaveBeenCalled();
  await waitFor(() => expect(button).not.toBeDisabled());
  await userEvent.click(button);
  expect(mocks.oauth).toHaveBeenCalledTimes(2);
});
