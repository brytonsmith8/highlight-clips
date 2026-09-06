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
  /**
   * Absolute origin of this deployment, no trailing slash — used server-side to
   * build absolute URLs (Stripe `success_url`/`cancel_url`, order links in
   * email, `metadataBase`).
   *
   * Resolution order:
   *   1. `NEXT_PUBLIC_SITE_URL` — explicit override / canonical custom domain.
   *   2. `VERCEL_PROJECT_PRODUCTION_URL` on a production deployment — the stable
   *      production alias (e.g. `highlight-clips.vercel.app`), so the checkout
   *      return URL is always the real site even before this var is configured.
   *   3. `VERCEL_URL` — the per-deployment URL (covers preview deployments).
   *   4. `http://localhost:3000` — local dev only.
   *
   * The `VERCEL_*` vars are not `NEXT_PUBLIC_`, so steps 2–3 only resolve on the
   * server. Every current caller is server-side; a browser caller would need
   * `NEXT_PUBLIC_SITE_URL` set.
   */
  get siteUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (explicit) return explicit.replace(/\/$/, "");

    const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (process.env.VERCEL_ENV === "production" && productionDomain) {
      return `https://${productionDomain.replace(/\/$/, "")}`;
    }

    const deploymentDomain = process.env.VERCEL_URL?.trim();
    if (deploymentDomain) return `https://${deploymentDomain.replace(/\/$/, "")}`;

    if (productionDomain) {
      return `https://${productionDomain.replace(/\/$/, "")}`;
    }

    return "http://localhost:3000";
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
