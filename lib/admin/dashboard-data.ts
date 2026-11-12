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
