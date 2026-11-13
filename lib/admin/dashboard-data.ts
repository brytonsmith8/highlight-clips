import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { listEditOrders } from "@/lib/edit-orders";

/**
 * Read-only numbers for the admin dashboard tiles. Uses only existing tables; nothing here writes.
 * Callers must run requireAdmin()/requireAdminOrRedirect() first.
 */
export interface DashboardStats {
  clipsTotal: number;
  clipsPublished: number;
  clipsNotPublished: number;
  gamesTotal: number;
  /** One order = one Stripe Checkout Session (a purchase of one or many clips). */
  ordersTotal: number;
  /** Paid BRYT VISION EDIT add-ons whose edit has not been delivered yet. */
  addOnsEditOpen: number;
  /** Paid add-ons whose free shirt has not shipped yet. */
  addOnsShirtOpen: number;
}

export function countDistinct(values: (string | null | undefined)[]): number {
  return new Set(values.filter((v): v is string => !!v)).size;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = createServiceClient();
  const [clips, games, purchases, addOns] = await Promise.all([
    supabase.from("clips").select("id, published"),
    supabase.from("games").select("id"),
    supabase.from("purchases").select("stripe_payment_id"),
    listEditOrders(),
  ]);
  if (clips.error) throw new Error(clips.error.message);
  if (games.error) throw new Error(games.error.message);
  if (purchases.error) throw new Error(purchases.error.message);

  const clipRows = (clips.data ?? []) as { id: string; published: boolean }[];
  const published = clipRows.filter((c) => c.published).length;
  const paid = addOns.filter((o) => o.payment_status === "paid");

  return {
    clipsTotal: clipRows.length,
    clipsPublished: published,
    clipsNotPublished: clipRows.length - published,
    gamesTotal: (games.data ?? []).length,
    ordersTotal: countDistinct(((purchases.data ?? []) as { stripe_payment_id: string }[]).map((p) => p.stripe_payment_id)),
    addOnsEditOpen: paid.filter((o) => (o.edit_status ?? "awaiting_edit") !== "delivered").length,
    addOnsShirtOpen: paid.filter((o) => {
      const s = o.shirt_status ?? "awaiting_shipment";
      return s === "awaiting_shipment" || s === "preparing_shipment";
    }).length,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Recent clips
// ---------------------------------------------------------------------------------------------------------

/**
 * Only two states can be told apart from the database: a clip is published or it is not. (Whether a
 * not-published clip was never published or was published and then pulled is not recorded, so the dashboard
 * never labels a clip "Draft".) "Processing" is shown live in the upload form while a preview is being made.
 */
export type ClipStatus = "published" | "not_published";
export type ClipStatusFilter = "all" | ClipStatus;

export function clipStatusOf(published: boolean): ClipStatus {
  return published ? "published" : "not_published";
}
export function clipStatusLabel(status: ClipStatus): string {
  return status === "published" ? "Published" : "Not Published";
}
export function parseStatusFilter(value: string | string[] | undefined): ClipStatusFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "published" || v === "not_published" ? v : "all";
}

export interface RecentClip {
  id: string;
  gameId: string;
  gameLabel: string;
  gameDate: string | null;
  sport: string | null;
  schools: string[];
  athleteId: string | null;
  athleteName: string | null;
  jersey: string | null;
  school: string | null;
  previewUrl: string | null;
  published: boolean;
  status: ClipStatus;
  purchases: number;
  createdAt: string;
}

export interface RecentClipsResult {
  clips: RecentClip[];
  total: number;
  counts: { all: number; published: number; not_published: number };
}

export async function getRecentClips(opts: { status?: ClipStatusFilter; limit?: number } = {}): Promise<RecentClipsResult> {
  const supabase = createServiceClient();
  const limit = opts.limit ?? 12;
  const [clipsRes, gamesRes, athletesRes] = await Promise.all([
    supabase
      .from("clips")
      .select("id, game_id, athlete_id, preview_url, published, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("games").select("id, school_a, school_b, game_date"),
    supabase.from("athletes").select("id, name, jersey_number"),
  ]);
  if (clipsRes.error) throw new Error(clipsRes.error.message);
  if (gamesRes.error) throw new Error(gamesRes.error.message);
  if (athletesRes.error) throw new Error(athletesRes.error.message);

  const all = (clipsRes.data ?? []) as {
    id: string;
    game_id: string;
    athlete_id: string | null;
    preview_url: string | null;
    published: boolean;
    created_at: string;
  }[];
  const counts = {
    all: all.length,
    published: all.filter((c) => c.published).length,
    not_published: all.filter((c) => !c.published).length,
  };
  const wanted = opts.status && opts.status !== "all" ? all.filter((c) => clipStatusOf(c.published) === opts.status) : all;
  const page = wanted.slice(0, limit);
  const ids = page.map((c) => c.id);

  // Optional columns (migrations 0006/0007) are read separately, so a missing column only means "no extra detail".
  const [metaRes, sportsRes, purchaseRes] = await Promise.all([
    ids.length ? supabase.from("clips").select("id, school, jersey_number").in("id", ids) : Promise.resolve({ data: [], error: null }),
    supabase.from("games").select("id, sport"),
    ids.length ? supabase.from("purchases").select("clip_id").in("clip_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  const meta = new Map<string, { school: string | null; jersey: string | null }>();
  if (!metaRes.error) {
    for (const r of (metaRes.data ?? []) as { id: string; school: string | null; jersey_number: string | null }[]) {
      meta.set(r.id, { school: r.school?.trim() || null, jersey: r.jersey_number?.trim() || null });
    }
  }
  const sports = new Map<string, string>();
  if (!sportsRes.error) {
    for (const r of (sportsRes.data ?? []) as { id: string; sport: string | null }[]) {
      if (r.sport?.trim()) sports.set(r.id, r.sport.trim());
    }
  }
  const purchaseCounts = new Map<string, number>();
  if (purchaseRes.error) throw new Error(purchaseRes.error.message);
  for (const r of (purchaseRes.data ?? []) as { clip_id: string }[]) {
    purchaseCounts.set(r.clip_id, (purchaseCounts.get(r.clip_id) ?? 0) + 1);
  }

  const gameById = new Map(
    ((gamesRes.data ?? []) as { id: string; school_a: string; school_b: string; game_date: string }[]).map((g) => [g.id, g]),
  );
  const athleteById = new Map(
    ((athletesRes.data ?? []) as { id: string; name: string | null; jersey_number: string | null }[]).map((a) => [a.id, a]),
  );

  return {
    total: wanted.length,
    counts,
    clips: page.map((c) => {
      const g = gameById.get(c.game_id);
      const a = c.athlete_id ? athleteById.get(c.athlete_id) : undefined;
      const m = meta.get(c.id);
      return {
        id: c.id,
        gameId: c.game_id,
        gameLabel: g ? `${g.school_a} vs ${g.school_b}` : "Unknown game",
        gameDate: g?.game_date ?? null,
        sport: sports.get(c.game_id) ?? null,
        schools: g ? [g.school_a, g.school_b] : [],
        athleteId: c.athlete_id,
        athleteName: a ? a.name?.trim() || null : null,
        jersey: m?.jersey ?? a?.jersey_number?.trim() ?? null,
        school: m?.school ?? null,
        previewUrl: c.preview_url,
        published: c.published,
        status: clipStatusOf(c.published),
        purchases: purchaseCounts.get(c.id) ?? 0,
        createdAt: c.created_at,
      };
    }),
  };
}
