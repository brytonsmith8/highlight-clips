import "server-only";

import type Stripe from "stripe";

import { EDIT_PRICE_CENTS, ADMIN_SETTABLE_STATUSES, type EditStatus } from "@/lib/edit-offer";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * BRYT VISION EDIT + FREE SHIRT orders (private, server-only; table `edit_orders`).
 *
 * A row is created ONLY from a Stripe Checkout Session that is verifiably `paid`, and only for sessions
 * our own checkout marked with metadata `edit = "1"`. One row per session (unique stripe_session_id), so a
 * duplicate webhook event, a retry, or the order-page self-heal can never create a second fulfillment task.
 */

export interface EditOrderRow {
  id: string;
  stripe_session_id: string;
  status: string;
  payment_status: string;
  edit_price_cents: number;
  session_total_cents: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  ship_name: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_postal_code: string | null;
  ship_country: string | null;
  athlete_id: string | null;
  athlete_name: string | null;
  athlete_jersey: string | null;
  athlete_school: string | null;
  shirt_size: string | null;
  shirt_color: string | null;
  shirt_sleeve: string | null;
  clips: EditClipSnapshot[];
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EditClipSnapshot {
  clipId: string;
  gameId: string | null;
  game: string;
  date: string | null;
  jersey: string | null;
}

function clipIdsOf(session: Pick<Stripe.Checkout.Session, "metadata">): string[] {
  const raw = session.metadata?.clip_ids ?? session.metadata?.clip_id ?? "";
  return Array.from(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)));
}

type ShippingDetails = { name?: string | null; address?: Stripe.Address | null } | null | undefined;

function shippingOf(session: Stripe.Checkout.Session): ShippingDetails {
  const s = session as unknown as {
    collected_information?: { shipping_details?: ShippingDetails } | null;
    shipping_details?: ShippingDetails;
  };
  return s.collected_information?.shipping_details ?? s.shipping_details ?? null;
}

/**
 * Records the BRYT VISION EDIT part of a paid session. No-op for sessions without the add-on, unpaid
 * sessions, or when the row already exists. THROWS if the database write fails, so the Stripe webhook
 * answers 500 and Stripe retries (the clip purchase itself is already safely recorded by then).
 */
export async function recordEditOrder(session: Stripe.Checkout.Session): Promise<{ recorded: boolean }> {
  if (session.metadata?.edit !== "1") return { recorded: false };
  if (session.payment_status !== "paid") return { recorded: false };

  const supabase = createServiceClient();
  const athleteId = session.metadata?.edit_athlete_id ?? null;

  const { data: athlete } = athleteId
    ? await supabase.from("athletes").select("id, name, jersey_number").eq("id", athleteId).maybeSingle()
    : { data: null };
  // `school` is an optional column (migration 0007): read it separately so a missing column can't hide the athlete.
  let athleteSchool: string | null = null;
  if (athleteId) {
    const s = await supabase.from("athletes").select("school").eq("id", athleteId).maybeSingle();
    athleteSchool = (!s.error && (s.data as { school: string | null } | null)?.school) || null;
  }

  const clipIds = clipIdsOf(session);
  const { data: clipRows } = clipIds.length
    ? await supabase.from("clips").select("id, game_id, athlete_id").in("id", clipIds)
    : { data: [] };
  const gameIds = Array.from(new Set((clipRows ?? []).map((c: { game_id: string }) => c.game_id)));
  const { data: gameRows } = gameIds.length
    ? await supabase.from("games").select("id, school_a, school_b, game_date").in("id", gameIds)
    : { data: [] };
  const gameById = new Map(
    (gameRows ?? []).map((g: { id: string; school_a: string; school_b: string; game_date: string }) => [g.id, g]),
  );
  const jerseyById = new Map<string, string | null>();
  const jr = clipIds.length ? await supabase.from("clips").select("id, jersey_number").in("id", clipIds) : null;
  if (jr && !jr.error) {
    for (const r of (jr.data ?? []) as { id: string; jersey_number: string | null }[]) jerseyById.set(r.id, r.jersey_number);
  }

  const snapshot: EditClipSnapshot[] = (clipRows ?? []).map((c: { id: string; game_id: string }) => {
    const g = gameById.get(c.game_id);
    return {
      clipId: c.id,
      gameId: c.game_id,
      game: g ? `${g.school_a} vs ${g.school_b}` : "Unknown game",
      date: g?.game_date ?? null,
      jersey: jerseyById.get(c.id) ?? null,
    };
  });

  const ship = shippingOf(session);
  const a = ship?.address ?? session.customer_details?.address ?? null;

  const row = {
    stripe_session_id: session.id,
    status: "paid_editing_needed",
    payment_status: "paid",
    edit_price_cents: EDIT_PRICE_CENTS,
    session_total_cents: typeof session.amount_total === "number" ? session.amount_total : null,
    customer_name: session.customer_details?.name ?? ship?.name ?? null,
    customer_email: session.customer_details?.email ?? session.customer_email ?? null,
    customer_phone: session.customer_details?.phone ?? null,
    ship_name: ship?.name ?? session.customer_details?.name ?? null,
    ship_line1: a?.line1 ?? null,
    ship_line2: a?.line2 ?? null,
    ship_city: a?.city ?? null,
    ship_state: a?.state ?? null,
    ship_postal_code: a?.postal_code ?? null,
    ship_country: a?.country ?? null,
    athlete_id: athleteId,
    athlete_name: (athlete as { name?: string } | null)?.name || null,
    athlete_jersey: (athlete as { jersey_number?: string } | null)?.jersey_number ?? null,
    athlete_school: athleteSchool,
    shirt_size: session.metadata?.edit_size ?? null,
    shirt_color: session.metadata?.edit_color ?? null,
    shirt_sleeve: session.metadata?.edit_sleeve ?? null,
    clips: snapshot,
  };

  const { error } = await supabase
    .from("edit_orders")
    .upsert(row, { onConflict: "stripe_session_id", ignoreDuplicates: true });
  if (error) throw new Error(`edit order: ${error.message}`);
  return { recorded: true };
}

export async function listEditOrders(): Promise<EditOrderRow[]> {
  const { data, error } = await createServiceClient()
    .from("edit_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as EditOrderRow[];
}

/** Customer-safe view for the order page (no address / phone). */
export async function getEditOrderPublic(token: string): Promise<{
  status: string;
  shirtSize: string | null;
  shirtColor: string | null;
  shirtSleeve: string | null;
  athleteJersey: string | null;
  athleteName: string | null;
} | null> {
  const { data, error } = await createServiceClient()
    .from("edit_orders")
    .select("status, shirt_size, shirt_color, shirt_sleeve, athlete_jersey, athlete_name")
    .eq("stripe_session_id", token)
    .maybeSingle();
  if (error || !data) return null;
  const d = data as Record<string, string | null>;
  return {
    status: d.status ?? "paid_editing_needed",
    shirtSize: d.shirt_size,
    shirtColor: d.shirt_color,
    shirtSleeve: d.shirt_sleeve,
    athleteJersey: d.athlete_jersey,
    athleteName: d.athlete_name,
  };
}

export async function setEditOrderStatus(sessionId: string, status: string): Promise<{ ok: boolean; message: string }> {
  if (!(ADMIN_SETTABLE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: "That status can't be set by hand." };
  }
  const { error, data } = await createServiceClient()
    .from("edit_orders")
    .update({ status: status as EditStatus, updated_at: new Date().toISOString() })
    .eq("stripe_session_id", sessionId)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: "Order not found." };
  return { ok: true, message: "Status updated." };
}
