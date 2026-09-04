/**
 * Hand-written TypeScript types for the Highlight Clips database.
 *
 * This project applies migrations through the Supabase dashboard rather than the
 * CLI, so these types are maintained by hand alongside `supabase/migrations/`.
 * Keep them in sync when a migration changes a table.
 *
 * All timestamps are ISO 8601 strings (Postgres `timestamptz`) as returned by
 * PostgREST / supabase-js. Money is always integer cents.
 */

// ── enums ────────────────────────────────────────────────────────────────────
export type GameStatus = "draft" | "active" | "expired";
export type ClipSource = "manual" | "ai";
export type ClipReviewStatus = "pending" | "approved" | "rejected";
export type OrderStatus = "pending" | "paid" | "canceled";
export type EditRequestStatus = "new" | "in_progress" | "done" | "canceled";

// ── rows ─────────────────────────────────────────────────────────────────────
export interface Settings {
  id: 1;
  clip_default_price_cents: number;
  currency: string;
  bulk_discount_threshold: number;
  /** Percentage, e.g. 25 means 25% off. Stored as numeric(5,2). */
  bulk_discount_percent: number;
  personal_edit_price_cents: number;
  download_window_hours: number;
  game_default_duration_days: number;
  updated_at: string;
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  sport: string;
  /** Date only, `YYYY-MM-DD`. */
  game_date: string;
  publish_at: string;
  expires_at: string;
  status: GameStatus;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  game_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Category {
  id: string;
  game_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Clip {
  id: string;
  game_id: string;
  team_id: string;
  category_id: string;
  jersey_number: string | null;
  description: string | null;
  /** null → fall back to `Settings.clip_default_price_cents`. */
  price_cents: number | null;
  duration_seconds: number | null;
  preview_path: string | null;
  original_path: string | null;
  poster_path: string | null;
  source: ClipSource;
  review_status: ClipReviewStatus;
  published: boolean;
  original_deleted_at: string | null;
  preview_deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A row of the `public_clips` view — the only clip shape exposed to the public.
 * Never includes `original_path`. `price_cents` is already resolved against the
 * settings default.
 */
export interface PublicClip {
  id: string;
  game_id: string;
  team_id: string;
  category_id: string;
  jersey_number: string | null;
  description: string | null;
  duration_seconds: number | null;
  preview_path: string | null;
  poster_path: string | null;
  price_cents: number;
  currency: string;
}

/** Denormalised copy kept on an order item so the record survives clip deletion. */
export interface OrderItemSnapshot {
  game_title?: string;
  game_date?: string;
  team_name?: string;
  category_name?: string;
  jersey_number?: string | null;
  description?: string | null;
}

export interface Order {
  id: string;
  /** High-entropy token in the private `/order/[token]` URL. */
  access_token: string;
  customer_email: string;
  status: OrderStatus;
  currency: string;
  subtotal_cents: number;
  discount_percent: number;
  discount_cents: number;
  total_cents: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  /** paid_at + settings.download_window_hours. Enforced server-side on download. */
  download_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  clip_id: string | null;
  unit_price_cents: number;
  snapshot: OrderItemSnapshot;
  download_count: number;
  last_downloaded_at: string | null;
  created_at: string;
}

export interface EditRequest {
  id: string;
  order_id: string | null;
  customer_name: string;
  customer_email: string;
  athlete_name: string | null;
  sport: string | null;
  school_team: string | null;
  instructions: string | null;
  quoted_price_cents: number | null;
  status: EditRequestStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  user_id: string;
  email: string;
  created_at: string;
}

export interface CleanupLogEntry {
  id: string;
  ran_at: string;
  games_expired: number;
  originals_deleted: number;
  previews_deleted: number;
  details: Record<string, unknown>;
}

// ── storage ──────────────────────────────────────────────────────────────────
export const STORAGE_BUCKETS = {
  originals: "originals",
  previews: "previews",
  posters: "posters",
  publicAssets: "public-assets",
} as const;

export type StorageBucket =
  (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];
