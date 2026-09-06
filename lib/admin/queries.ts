import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import {
  computeDownloadExpiry,
  isDownloadExpired,
} from "@/lib/orders";
import type { Athlete, Game } from "@/lib/db/types";

/**
 * Admin-only data access, via the service-role client (bypasses grants
 * entirely — sees unpublished clips and `full_url`). Every caller (a Server
 * Component page or Server Action) must call `requireAdmin()` /
 * `requireAdminOrRedirect()` first; these functions do not check auth
 * themselves.
 */

/** Full clip shape as seen by admin — includes full_url and published, which
 * the public-facing `Clip` type (lib/db/types.ts) deliberately omits. */
export interface AdminClip {
  id: string;
  price: number;
  game_id: string;
  athlete_id: string | null;
  preview_url: string | null;
  full_url: string | null;
  published: boolean;
  created_at: string;
}

export async function adminListGames(): Promise<Game[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, school_a, school_b, game_date, created_at")
    .order("game_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Game[];
}

export async function adminListAthletes(): Promise<Athlete[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("athletes")
    .select("id, name, jersey_number, created_at")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Athlete[];
}

export async function adminListClips(): Promise<AdminClip[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clips")
    .select(
      "id, price, game_id, athlete_id, preview_url, full_url, published, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminClip[];
}

export async function adminGetGame(id: string): Promise<Game | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, school_a, school_b, game_date, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Game | null) ?? null;
}

export async function adminListClipsForGame(
  gameId: string,
): Promise<AdminClip[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clips")
    .select(
      "id, price, game_id, athlete_id, preview_url, full_url, published, created_at",
    )
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminClip[];
}

/** How many `purchases` rows point at each of the given clip ids. Used to warn
 * before a delete and to decide whether it must be blocked. */
export async function adminPurchaseCountsByClip(
  clipIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (clipIds.length === 0) return counts;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("purchases")
    .select("clip_id")
    .in("clip_id", clipIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as { clip_id: string }[]) {
    counts.set(row.clip_id, (counts.get(row.clip_id) ?? 0) + 1);
  }
  return counts;
}

/** How many clips reference each of the given athlete ids. */
export async function adminClipCountsByAthlete(
  athleteIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (athleteIds.length === 0) return counts;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clips")
    .select("athlete_id")
    .in("athlete_id", athleteIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as { athlete_id: string | null }[]) {
    if (row.athlete_id) {
      counts.set(row.athlete_id, (counts.get(row.athlete_id) ?? 0) + 1);
    }
  }
  return counts;
}

export interface AdminOrderItem {
  clipId: string;
  label: string;
  priceDollars: number | null;
  clipMissing: boolean;
}

export interface AdminOrder {
  /** Stripe Checkout Session id — the access token in the /order/[token] URL. */
  token: string;
  buyerEmail: string;
  purchasedAt: string;
  expiresAt: string;
  expired: boolean;
  items: AdminOrderItem[];
}

/** Every purchase, grouped into one row per Stripe Checkout Session. */
export async function adminListOrders(): Promise<AdminOrder[]> {
  const supabase = createServiceClient();

  const { data: purchases, error } = await supabase
    .from("purchases")
    .select("id, clip_id, buyer_email, stripe_payment_id, purchased_at")
    .order("purchased_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!purchases || purchases.length === 0) return [];

  const clipIds = Array.from(new Set(purchases.map((p) => p.clip_id)));
  const { data: clips } = await supabase
    .from("clips")
    .select("id, price, game_id")
    .in("id", clipIds);
  const clipById = new Map((clips ?? []).map((c) => [c.id, c]));

  const gameIds = Array.from(
    new Set((clips ?? []).map((c) => c.game_id).filter(Boolean)),
  );
  const { data: games } =
    gameIds.length > 0
      ? await supabase
          .from("games")
          .select("id, school_a, school_b")
          .in("id", gameIds)
      : { data: [] as { id: string; school_a: string; school_b: string }[] };
  const gameById = new Map((games ?? []).map((g) => [g.id, g]));

  const byToken = new Map<string, typeof purchases>();
  for (const p of purchases) {
    const list = byToken.get(p.stripe_payment_id);
    if (list) list.push(p);
    else byToken.set(p.stripe_payment_id, [p]);
  }

  const orders: AdminOrder[] = [];
  for (const [token, rows] of byToken) {
    const purchasedAt = rows
      .map((r) => r.purchased_at)
      .sort()[0];
    orders.push({
      token,
      buyerEmail: rows[0].buyer_email,
      purchasedAt,
      expiresAt: computeDownloadExpiry(purchasedAt).toISOString(),
      expired: isDownloadExpired(purchasedAt),
      items: rows.map((r) => {
        const clip = clipById.get(r.clip_id);
        const game = clip ? gameById.get(clip.game_id) : undefined;
        return {
          clipId: r.clip_id,
          label: game
            ? `${game.school_a} vs ${game.school_b}`
            : "(clip deleted)",
          priceDollars: clip?.price ?? null,
          clipMissing: !clip,
        };
      }),
    });
  }

  return orders.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}
