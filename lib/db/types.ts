/**
 * TypeScript types for the production Supabase schema, matched by hand
 * against the live `games` / `athletes` / `clips` / `purchases` tables.
 *
 * `clips.full_url` (the original/high-quality video) is intentionally not
 * modeled here: anon/authenticated have no grant on that column, and no
 * query in this app selects it. `purchases` is not modeled at all — it's
 * server-only (buyer_email, stripe_payment_id are PII) and unused until the
 * purchase/download flow is built.
 */

export interface Game {
  id: string;
  school_a: string;
  school_b: string;
  /** Date only, "YYYY-MM-DD". */
  game_date: string;
  created_at: string;
}

export interface Athlete {
  id: string;
  name: string;
  jersey_number: string | null;
  created_at: string;
}

export interface Clip {
  id: string;
  /** Confirmed as whole dollars (e.g. 15 -> $15.00). */
  price: number;
  game_id: string;
  athlete_id: string | null;
  preview_url: string | null;
  /** Gates public visibility. Public queries always filter to published = true. */
  published: boolean;
  created_at: string;
}
