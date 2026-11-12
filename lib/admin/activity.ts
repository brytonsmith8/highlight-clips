import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { adminListOrders } from "@/lib/admin/queries";
import { listEditOrders, type EditOrderRow } from "@/lib/edit-orders";
import { formatOrderNumber } from "@/lib/edit-offer";

/**
 * Admin activity feed, built ONLY from timestamps that already exist in the database. Nothing is invented:
 *  - clip uploaded            <- clips.created_at
 *  - order placed             <- purchases.purchased_at (one event per checkout)
 *  - add-on ordered           <- edit_orders.created_at
 *  - add-on admin alert sent  <- edit_orders.admin_notified_at
 *  - shirt shipped/delivered  <- edit_orders.shirt_shipped_at / shirt_delivered_at
 *  - tracking emailed         <- edit_orders.tracking_emailed_at
 *  - edit delivered / first download <- edit_orders.delivered_at / first_downloaded_at
 * Publishing and unpublishing are NOT recorded anywhere, so they cannot appear here.
 * Callers must run requireAdmin()/requireAdminOrRedirect() first.
 */
export type ActivityType = "upload" | "sale" | "fulfillment";
export type ActivityFilter = "all" | ActivityType;

export interface ActivityItem {
  id: string;
  at: string;
  type: ActivityType;
  title: string;
  detail: string;
  href?: string;
}

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sale", label: "Sales" },
  { id: "upload", label: "Uploads" },
  { id: "fulfillment", label: "Fulfillment" },
];

export function parseActivityFilter(value: string | string[] | undefined): ActivityFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "sale" || v === "upload" || v === "fulfillment" ? v : "all";
}

interface ClipRow {
  id: string;
  game_id: string;
  athlete_id: string | null;
  created_at: string;
}

export interface ActivitySources {
  clips: ClipRow[];
  games: { id: string; school_a: string; school_b: string }[];
  athletes: { id: string; name: string | null; jersey_number: string | null }[];
  orders: { token: string; buyerEmail: string; purchasedAt: string; items: { label: string }[] }[];
  addOns: EditOrderRow[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Pure: turns raw rows into a newest-first list. Exported so it can be tested without a database. */
export function buildActivity(src: ActivitySources): ActivityItem[] {
  const out: ActivityItem[] = [];
  const gameName = new Map(src.games.map((g) => [g.id, `${g.school_a} vs ${g.school_b}`]));
  const athlete = new Map(src.athletes.map((a) => [a.id, a]));

  for (const c of src.clips) {
    if (!c.created_at) continue;
    const a = c.athlete_id ? athlete.get(c.athlete_id) : undefined;
    const who = a ? [a.jersey_number ? `#${a.jersey_number}` : "", a.name?.trim() ?? ""].filter(Boolean).join(" ") : "";
    out.push({
      id: `clip-${c.id}`,
      at: c.created_at,
      type: "upload",
      title: "Clip uploaded",
      detail: [gameName.get(c.game_id) ?? "Unknown game", who].filter(Boolean).join(" · "),
    });
  }

  for (const o of src.orders) {
    const games = Array.from(new Set(o.items.map((i) => i.label)));
    out.push({
      id: `order-${o.token}`,
      at: o.purchasedAt,
      type: "sale",
      title: `Order placed: ${plural(o.items.length, "clip")}`,
      detail: `${games.join(", ")} · ${o.buyerEmail}`,
      href: "/admin/orders",
    });
  }

  for (const e of src.addOns) {
    const bv = e.order_number != null ? formatOrderNumber(e.order_number) : "";
    const who = [e.athlete_jersey ? `#${e.athlete_jersey}` : "", e.athlete_name ?? ""].filter(Boolean).join(" ");
    const base = [bv, who, e.customer_name ?? e.customer_email].filter(Boolean).join(" · ");
    const mk = (key: string, at: string | null | undefined, type: ActivityType, title: string, extra = "") => {
      if (!at) return;
      out.push({
        id: `addon-${e.stripe_session_id}-${key}`,
        at,
        type,
        title,
        detail: [base, extra].filter(Boolean).join(" · "),
        href: "/admin/orders",
      });
    };
    mk("ordered", e.created_at, "sale", "BRYT VISION EDIT add-on ordered");
    mk("alert", e.admin_notified_at, "fulfillment", "Admin alert email sent");
    mk(
      "shipped",
      e.shirt_shipped_at,
      "fulfillment",
      "Shirt shipped",
      [e.shirt_carrier, e.shirt_tracking_number].filter(Boolean).join(" ").trim(),
    );
    mk("shirt-delivered", e.shirt_delivered_at, "fulfillment", "Shirt delivered");
    mk("tracking", e.tracking_emailed_at, "fulfillment", "Tracking recorded as emailed to customer");
    mk("edit-delivered", e.delivered_at, "fulfillment", "Edit delivered to customer");
    mk("first-download", e.first_downloaded_at, "fulfillment", "Customer first downloaded the edit");
  }

  return out
    .filter((i) => !Number.isNaN(Date.parse(i.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
}

export async function getActivity(opts: { filter?: ActivityFilter; limit?: number } = {}): Promise<{
  items: ActivityItem[];
  total: number;
}> {
  const supabase = createServiceClient();
  const [clips, games, athletes, orders, addOns] = await Promise.all([
    supabase.from("clips").select("id, game_id, athlete_id, created_at"),
    supabase.from("games").select("id, school_a, school_b"),
    supabase.from("athletes").select("id, name, jersey_number"),
    adminListOrders(),
    listEditOrders(),
  ]);
  if (clips.error) throw new Error(clips.error.message);
  if (games.error) throw new Error(games.error.message);
  if (athletes.error) throw new Error(athletes.error.message);

  const all = buildActivity({
    clips: (clips.data ?? []) as ClipRow[],
    games: (games.data ?? []) as ActivitySources["games"],
    athletes: (athletes.data ?? []) as ActivitySources["athletes"],
    orders,
    addOns,
  });
  const filtered = opts.filter && opts.filter !== "all" ? all.filter((i) => i.type === opts.filter) : all;
  return { items: filtered.slice(0, opts.limit ?? 100), total: filtered.length };
}
