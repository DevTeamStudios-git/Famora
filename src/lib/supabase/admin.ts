import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: ReturnType<typeof createClient> | undefined;

/**
 * Service-role Supabase client — bypasses RLS entirely. Only ever import
 * this from server-only modules (attachment finalization needs to read
 * Storage object metadata and download the first bytes of a file to sniff
 * its real content type, which the RLS-aware anon/authenticated client
 * cannot do for another member's just-uploaded object). Never send this
 * client, or anything derived from SUPABASE_SERVICE_ROLE_KEY, to the browser.
 */
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
