import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// ============================================================================
// PRIVILEGED CLIENT — service-role, bypasses RLS entirely.
//
// Project convention (per architecture review of the attachments feature):
//   lib/supabase/admin.ts
//         ↓
//   ONLY server-side storage/security infrastructure
//   (currently: lib/storage/sniff.ts, for the one thing the RLS-aware
//   client structurally cannot do -- inspect another member's just-
//   uploaded object before any FileBlob/ownership record makes it
//   theirs to read normally)
//         ↓
//   NEVER imported by ordinary queries, server actions, or components
//
// If you're reaching for this because the RLS-aware client
// (lib/supabase/server.ts, bound to the caller's own session) "won't let
// you" do something: that's RLS doing its job, not a reason to reach for
// the client that skips it. Add the specific policy that authorizes the
// specific operation instead. Grep for getSupabaseAdminClient importers in
// code review -- every one should be justifiable as "this literally cannot
// be expressed as an RLS-scoped read/write," not "it was more convenient."
// ============================================================================

let client: ReturnType<typeof createClient> | undefined;

export function getSupabaseAdminClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error(
      "Supabase is not configured (missing SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  if (!client) {
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
