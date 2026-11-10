import "server-only";

import type Stripe from "stripe";

import {
  EDIT_PRICE_CENTS,
  ADMIN_SETTABLE_STATUSES,
  EDIT_TRACK_STATUSES,
  SHIRT_CARRIERS,
  SHIRT_STATUSES,
  formatOrderNumber,
  isValidTrackingNumber,
  legacyStatusForEditTrack,
  trackingUrl,
  type EditStatus,
  type EditTrackStatus,
  type ShirtStatus,
} from "@/lib/edit-offer";
import { sendAdminAddOnEmail, sendEditReadyEmail, sendShirtShippedEmail } from "@/lib/email";
import { getOrderAccess } from "@/lib/order-access";
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
  /** Fulfillment columns from migration 0010 (undefined until it is applied; the UI shows the defaults). */
  order_number?: number | null;
  shirt_status?: string | null;
  edit_status?: string | null;
  shirt_carrier?: string | null;
  shirt_tracking_number?: string | null;
  shirt_shipped_at?: string | null;
  shirt_delivered_at?: string | null;
  tracking_emailed_at?: string | null;
  admin_notified_at?: string | null;
  delivery_path?: string | null;
  delivered_at?: string | null;
  first_downloaded_at?: string | null;
  download_count?: number | null;
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

  const { data: inserted, error } = await supabase
    .from("edit_orders")
    .upsert(row, { onConflict: "stripe_session_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`edit order: ${error.message}`);
  // Only the request that really created the row announces it, so webhook retries and the order-page self-heal
  // never send a second notification. The notification can never fail the purchase.
  if ((inserted ?? []).length > 0) await notifyAdminOfAddOn(session.id);
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
  delivered: boolean;
  shirtStatus: string | null;
  editStatus: string | null;
  shirtCarrier: string | null;
  shirtTracking: string | null;
} | null> {
  const { data, error } = await createServiceClient()
    .from("edit_orders")
    .select("status, shirt_size, shirt_color, shirt_sleeve, athlete_jersey, athlete_name")
    .eq("stripe_session_id", token)
    .maybeSingle();
  if (error || !data) return null;
  const d = data as Record<string, string | null>;
  // Delivery columns come from migration 0007 too, but read separately so an old schema can't hide the order.
  const dl = await createServiceClient()
    .from("edit_orders")
    .select("delivery_path")
    .eq("stripe_session_id", token)
    .maybeSingle();
  const delivered = !dl.error && !!(dl.data as { delivery_path: string | null } | null)?.delivery_path;
  // Fulfillment columns come from migration 0010: read separately so an old schema can't hide the order.
  const ff = await createServiceClient()
    .from("edit_orders")
    .select("shirt_status, edit_status, shirt_carrier, shirt_tracking_number")
    .eq("stripe_session_id", token)
    .maybeSingle();
  const f = !ff.error ? ((ff.data as Record<string, string | null> | null) ?? {}) : {};
  return {
    delivered,
    shirtStatus: f.shirt_status ?? null,
    editStatus: f.edit_status ?? null,
    shirtCarrier: f.shirt_carrier ?? null,
    shirtTracking: f.shirt_tracking_number ?? null,
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

/** Private delivery info for a PAID edit order (server-only; never sent to the browser as-is). */
export async function getEditDelivery(
  sessionId: string,
): Promise<{ path: string; deliveredAt: string | null } | null> {
  const { data, error } = await createServiceClient()
    .from("edit_orders")
    .select("delivery_path, delivered_at, payment_status")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (error || !data) return null;
  const d = data as { delivery_path: string | null; delivered_at: string | null; payment_status: string };
  if (d.payment_status !== "paid" || !d.delivery_path) return null;
  return { path: d.delivery_path, deliveredAt: d.delivered_at };
}

/** Save the finished edit's private storage path and mark the edit as completed. */
export async function setEditDelivery(sessionId: string, path: string): Promise<{ ok: boolean; message: string; first?: boolean }> {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("edit_orders")
    .select("status, delivery_path")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (!row) return { ok: false, message: "Order not found." };
  const first = !(row as { delivery_path: string | null }).delivery_path;
  const status = (row as { status: string }).status;
  const patch: Record<string, unknown> = {
    delivery_path: path,
    delivered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Only move forward: never pull a shipped/fulfilled order back to "edit completed".
  if (status === "paid_editing_needed" || status === "editing_in_progress") {
    patch.status = "edit_completed";
    patch.edit_status = "edit_completed"; // migration 0010 column; dropped below if it does not exist yet
  }
  let { error } = await supabase.from("edit_orders").update(patch).eq("stripe_session_id", sessionId);
  if (error && isMissingColumnError(error) && "edit_status" in patch) {
    delete patch.edit_status;
    ({ error } = await supabase.from("edit_orders").update(patch).eq("stripe_session_id", sessionId));
  }
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Edit delivered.", first };
}

/**
 * Tell the customer their finished edit is ready. Only for a PAID order with a delivered file, and only the
 * first time (re-uploading a replacement does not email again). Never throws: the delivery itself already succeeded.
 */
export async function notifyEditReady(sessionId: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    const { data } = await createServiceClient()
      .from("edit_orders")
      .select("customer_email, athlete_name, athlete_jersey, payment_status, delivery_path")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    const d = data as {
      customer_email: string | null; athlete_name: string | null; athlete_jersey: string | null;
      payment_status: string; delivery_path: string | null;
    } | null;
    if (!d || d.payment_status !== "paid" || !d.delivery_path) return { sent: false, reason: "not deliverable" };
    if (!d.customer_email) return { sent: false, reason: "no customer email on the order" };
    if (!(await getOrderAccess(sessionId)).allowed) return { sent: false, reason: "order refunded or under dispute" };
    const label = [d.athlete_jersey ? `#${d.athlete_jersey}` : "", d.athlete_name ?? ""].filter(Boolean).join(" ") || null;
    await sendEditReadyEmail({ to: d.customer_email, token: sessionId, athleteLabel: label });
    return { sent: true };
  } catch (e) {
    console.error("[edit orders] ready email failed:", e);
    return { sent: false, reason: "email failed" };
  }
}

/** Count a download of the finished edit (best effort; never blocks the download). */
export async function recordEditDownload(sessionId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("edit_orders")
      .select("download_count, first_downloaded_at")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (!data) return;
    const d = data as { download_count: number | null; first_downloaded_at: string | null };
    await supabase
      .from("edit_orders")
      .update({
        download_count: (d.download_count ?? 0) + 1,
        first_downloaded_at: d.first_downloaded_at ?? new Date().toISOString(),
      })
      .eq("stripe_session_id", sessionId);
  } catch {
    /* tracking is optional */
  }
}


function isMissingColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || /column .* does not exist|could not find the .* column/i.test(error.message ?? ""));
}

const MIGRATION_HINT = "Fulfillment tracking needs database migration 0010 to be applied first.";

function athleteLabelOf(d: { athlete_jersey?: string | null; athlete_name?: string | null }): string | null {
  return [d.athlete_jersey ? `#${d.athlete_jersey}` : "", d.athlete_name ?? ""].filter(Boolean).join(" ") || null;
}

/**
 * Emails the owner (ADMIN_NOTIFY_EMAIL) that a PAID add-on order was recorded. Called once, by the request that
 * created the row. Never throws and never blocks the purchase; if the address is not configured it only logs.
 */
export async function notifyAdminOfAddOn(sessionId: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    const to = process.env.ADMIN_NOTIFY_EMAIL?.trim();
    if (!to) {
      console.warn("[edit orders] ADMIN_NOTIFY_EMAIL is not set: no new-order email sent for", sessionId);
      return { sent: false, reason: "ADMIN_NOTIFY_EMAIL not set" };
    }
    const supabase = createServiceClient();
    const { data } = await supabase.from("edit_orders").select("*").eq("stripe_session_id", sessionId).maybeSingle();
    const d = data as EditOrderRow | null;
    if (!d || d.payment_status !== "paid") return { sent: false, reason: "not a paid add-on order" };
    if (d.admin_notified_at) return { sent: false, reason: "already notified" };
    await sendAdminAddOnEmail({
      to,
      orderNumber: formatOrderNumber(d.order_number, d.id),
      customerName: d.customer_name,
      athleteLabel: athleteLabelOf(d),
      shirt: `${d.shirt_color ?? "?"}, size ${d.shirt_size ?? "?"}${d.shirt_sleeve ? `, ${d.shirt_sleeve} sleeve` : ""}`,
      shipTo: [
        [d.ship_name, d.ship_line1, d.ship_line2].filter(Boolean).join(", "),
        [[d.ship_city, d.ship_state].filter(Boolean).join(", "), d.ship_postal_code].filter(Boolean).join(" "),
        d.ship_country ?? "",
      ].filter(Boolean),
      clipCount: Array.isArray(d.clips) ? d.clips.length : 0,
    });
    await supabase
      .from("edit_orders")
      .update({ admin_notified_at: new Date().toISOString() })
      .eq("stripe_session_id", sessionId); // column from migration 0010; harmless if missing
    return { sent: true };
  } catch (e) {
    console.error("[edit orders] admin notification failed:", e instanceof Error ? e.message : "error");
    return { sent: false, reason: "email failed" };
  }
}

/** Admin: move the EDIT through Awaiting Edit / Editing in Progress / Edit Completed / Delivered, with notes. */
export async function setEditTrack(
  sessionId: string,
  status: string,
  notes: string | null,
): Promise<{ ok: boolean; message: string }> {
  if (!EDIT_TRACK_STATUSES.some((s) => s.id === status)) return { ok: false, message: "Unknown edit status." };
  const track = status as EditTrackStatus;
  const patch: Record<string, unknown> = {
    edit_status: track,
    status: legacyStatusForEditTrack(track), // keeps the cleanup job's footage-retention rule correct
    updated_at: new Date().toISOString(),
  };
  if (notes !== null) patch.admin_notes = notes.slice(0, 4000) || null;
  const { error, data } = await createServiceClient()
    .from("edit_orders")
    .update(patch)
    .eq("stripe_session_id", sessionId)
    .select("id");
  if (error) return { ok: false, message: isMissingColumnError(error) ? MIGRATION_HINT : error.message };
  if (!data || data.length === 0) return { ok: false, message: "Order not found." };
  return { ok: true, message: "Edit status saved." };
}

/**
 * Admin: update the shirt shipment. Shipped needs a carrier and a tracking number. When asked, emails the customer
 * the tracking details (never for a refunded / disputed order, and never for an unpaid one).
 */
export async function setShirtFulfillment(
  sessionId: string,
  input: { status: string; carrier: string | null; tracking: string | null; emailCustomer: boolean },
): Promise<{ ok: boolean; message: string }> {
  if (!SHIRT_STATUSES.some((s) => s.id === input.status)) return { ok: false, message: "Unknown shirt status." };
  const status = input.status as ShirtStatus;
  const carrier = input.carrier?.trim() || null;
  const tracking = input.tracking?.trim() || null;
  if (carrier && !(SHIRT_CARRIERS as readonly string[]).includes(carrier)) return { ok: false, message: "Unknown carrier." };
  if (tracking && !isValidTrackingNumber(tracking)) {
    return { ok: false, message: "Tracking number can only use letters, numbers, spaces and dashes (6-40 characters)." };
  }
  if (status === "shipped" && (!carrier || !tracking)) {
    return { ok: false, message: "Choose the carrier and enter the tracking number to mark the shirt as shipped." };
  }

  const supabase = createServiceClient();
  const { data: row, error: readError } = await supabase.from("edit_orders").select("*").eq("stripe_session_id", sessionId).maybeSingle();
  if (readError) return { ok: false, message: readError.message };
  const d = row as EditOrderRow | null;
  if (!d) return { ok: false, message: "Order not found." };
  if (d.payment_status !== "paid") return { ok: false, message: "This order is not paid." };
  if (d.shirt_status === undefined) return { ok: false, message: MIGRATION_HINT };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    shirt_status: status,
    shirt_carrier: carrier,
    shirt_tracking_number: tracking,
    updated_at: now,
  };
  if ((status === "shipped" || status === "delivered") && !d.shirt_shipped_at) patch.shirt_shipped_at = now;
  if (status === "delivered" && !d.shirt_delivered_at) patch.shirt_delivered_at = now;

  let emailNote = "";
  if (input.emailCustomer && (status === "shipped" || status === "delivered") && carrier && tracking) {
    if (!d.customer_email) {
      emailNote = " No customer email is on the order, so nothing was emailed.";
    } else if (!(await getOrderAccess(sessionId)).allowed) {
      emailNote = " The order is refunded or under dispute, so no email was sent.";
    } else {
      try {
        await sendShirtShippedEmail({
          to: d.customer_email,
          token: sessionId,
          carrier,
          trackingNumber: tracking,
          trackingUrl: trackingUrl(carrier, tracking),
          athleteLabel: athleteLabelOf(d),
        });
        patch.tracking_emailed_at = now;
        emailNote = " Tracking emailed to the customer.";
      } catch (e) {
        console.error("[edit orders] tracking email failed:", e instanceof Error ? e.message : "error");
        emailNote = " The tracking email could NOT be sent (saved anyway); try again.";
      }
    }
  }

  const { error } = await supabase.from("edit_orders").update(patch).eq("stripe_session_id", sessionId);
  if (error) return { ok: false, message: isMissingColumnError(error) ? MIGRATION_HINT : error.message };
  return { ok: true, message: `Shirt status saved.${emailNote}` };
}
