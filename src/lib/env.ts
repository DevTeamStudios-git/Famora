// Centralized environment access. Keeps secrets on the server: anything not
// prefixed with NEXT_PUBLIC_ must never be referenced from client components.

export const env = {
  // Public (safe in the browser)
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  // OAuth redirects are resolved on the server. A server-only canonical origin
  // also supports deployments that imported their legacy public URL as a Secret.
  NEXT_PUBLIC_APP_URL:
    process.env.FAMORA_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000",

  // Server-only
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  DIRECT_URL: process.env.DIRECT_URL ?? "",
} as const;

export function isSupabaseConfigured() {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    env.NEXT_PUBLIC_SUPABASE_URL.startsWith("http"),
  );
}
