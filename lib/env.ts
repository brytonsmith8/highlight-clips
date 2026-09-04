/**
 * Centralised, validated access to environment variables.
 *
 * Import the named getters rather than reading `process.env` directly so a
 * missing or empty variable fails loudly (with a clear message) instead of
 * surfacing as a confusing downstream error.
 *
 * `NEXT_PUBLIC_*` values are inlined by Next at build time and are safe to read
 * in the browser. Everything else is server-only — never import `serverEnv`
 * into a Client Component.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Add it to .env.local (local) and the Vercel project settings (deployed).`,
    );
  }
  return value;
}

/** Safe in the browser and on the server. */
export const publicEnv = {
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  /** Absolute origin of this deployment, e.g. https://highlight-clips.vercel.app */
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000",
};

/**
 * Server-only. Reading `serverEnv` throws if it somehow runs in the browser,
 * and the service-role key is only resolved when actually requested.
 */
export const serverEnv = {
  get supabaseServiceRoleKey(): string {
    if (typeof window !== "undefined") {
      throw new Error("serverEnv.supabaseServiceRoleKey read in the browser");
    }
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
};
