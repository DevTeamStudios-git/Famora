import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("challenge") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 });
  const authorize = new URL("/auth/v1/authorize", env.NEXT_PUBLIC_SUPABASE_URL);
  authorize.searchParams.set("provider", "google");
  authorize.searchParams.set("redirect_to", `${env.NEXT_PUBLIC_APP_URL}/auth/callback?native=1`);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "s256");
  return NextResponse.redirect(authorize);
}
