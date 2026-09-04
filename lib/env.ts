/**
 * Centralised, validated access to environment variables.
 *
 * Import the named getters rather than reading `process.env` directly so a
 * missing or empty variable fails loudly (with a clear message) at the point of
 * use, instead of surfacing as a confusing downstream error.
 *
 * Validation is lazy: reading a getter throws if its variable is missing, but
 * merely importing this module never does. That keeps `next build` working on
 * an environment that hasn't configured a variable a given route doesn't use.
 *
 * `NEXT_PUBLIC_*` values are inlined by Next at build time and are safe to read
 * in the browser. `serverEnv` is server-only — never import it into a Client
 * Component.
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
  get supabaseUrl(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabaseAnonKey(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  /** Absolute origin of this deployment, no trailing slash. Falls back to localhost. */
  get siteUrl(): string {
    return (
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
      "http://localhost:3000"
    );
  },
};

/** Server-only. The service-role key bypasses Row-Level Security. */
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
