import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Supabase client for use in Client Components (browser).
 *
 * Uses the anon key and is subject to Row-Level Security. Never perform
 * privileged writes from here — those go through Server Actions / Route
 * Handlers using the service-role client.
 */
export function createClient() {
  return createBrowserClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
  );
}
