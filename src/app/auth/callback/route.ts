import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Handles the Google OAuth callback code exchange (PKCE flow) and stores the
 * session in cookies via the response. After that, /(family) layouts enforce
 * the whitelist check.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (searchParams.get("native") === "1") {
    const callback = new URL("famora://auth/callback");
    if (code) callback.searchParams.set("code", code);
    else callback.searchParams.set("error", "Google sign-in was cancelled or failed.");
    return NextResponse.redirect(callback);
  }
  const requestedNext = searchParams.get("next") ?? "/?start=1";
  const next =
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    !requestedNext.includes("\\")
      ? requestedNext
      : "/";

  let response = NextResponse.redirect(`${origin}${next}`);

  if (code) {
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      response = NextResponse.redirect(`${origin}/login?error=auth`);
    }
  }

  return response;
}
