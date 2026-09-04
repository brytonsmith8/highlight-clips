import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Supabase client with the service-role key.
 *
 * BYPASSES Row-Level Security. Use only in trusted server code (Route Handlers,
 * Server Actions, cron jobs) and only after authorising the caller yourself.
 * The `server-only` import above makes the build fail if this file is ever
 * pulled into a client bundle.
 */
export function createServiceClient() {
  return createSupabaseClient(
    publicEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
