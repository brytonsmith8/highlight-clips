import "server-only";

import type Stripe from "stripe";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Per-order access flags (refunds / disputes), private table `order_access_flags` (migration 0008).
 *
 * Key = the Checkout Session id, the same value as purchases.stripe_payment_id (and the order link token).
 * No row means normal access. Access is suspended by: a FULL refund, an OPEN dispute, or a LOST dispute.
 * A partial refund only flags the order for manual review: Stripe does not say which clip was refunded,
 * so nothing is revoked automatically.
 */

export interface OrderAccessFlags {
  refund_status: "none" | "partial" | "full";
  refunded_cents: number;
  dispute_status: "none" | "open" | "won" | "lost";
  needs_review: boolean;
  stripe_charge_id?: string | null;
  stripe_dispute_id?: string | null;
  note?: string | null;
}

export type AccessReason = "refunded" | "disputed" | "dispute_lost" | "unavailable";

export interface AccessDecision {
  allowed: boolean;
  reason: AccessReason | null;
  needsReview: boolean;
}

/** Pure rule: what a set of flags means for downloads. No flags = allowed. */
export function effectiveAccess(flags: Partial<OrderAccessFlags> | null | undefined): AccessDecision {
  if (!flags) return { allowed: true, reason: null, needsReview: false };
  const refund = flags.refund_status ?? "none";
  const dispute = flags.dispute_status ?? "none";
  const needsReview = !!flags.needs_review;
  if (refund === "full") return { allowed: false, reason: "refunded", needsReview };
  if (dispute === "lost") return { allowed: false, reason: "dispute_lost", needsReview };
  if (dispute === "open") return { allowed: false, reason: "disputed", needsReview };
  return { allowed: true, reason: null, needsReview };
}

/** True when the error means the table/column has not been created yet (migration not run). */
export function isMissingRelationError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (m.includes("does not exist") && m.includes("relation")) ||
    m.includes("could not find the table")
  );
}

export function accessMessage(reason: AccessReason | null): string {
  switch (reason) {
    case "refunded":
      return "This order was refunded, so downloads are no longer available.";
    case "disputed":
      return "Downloads are paused while the payment is under review. Please contact us.";
    case "dispute_lost":
      return "Downloads are no longer available for this order. Please contact us.";
    case "unavailable":
      return "We could not verify this order right now. Please try again in a minute.";
    default:
      return "";
  }
}

/**
 * Access decision for an order. Fails CLOSED: if the lookup errors for any reason other than "the table does
 * not exist yet", downloads are refused for now (the customer can simply retry) instead of guessing "allowed".
 */
export async function getOrderAccess(sessionId: string): Promise<AccessDecision> {
  const { data, error } = await createServiceClient()
    .from("order_access_flags")
    .select("refund_status, refunded_cents, dispute_status, needs_review")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error)) return { allowed: true, reason: null, needsReview: false };
    console.error("[order access] lookup failed:", error.message);
    return { allowed: false, reason: "unavailable", needsReview: false };
  }
  return effectiveAccess(data as Partial<OrderAccessFlags> | null);
}

/** Admin listing: flagged orders by session id. A failed lookup returns an empty map (display only). */
export async function listOrderAccessFlags(): Promise<Map<string, OrderAccessFlags>> {
  const out = new Map<string, OrderAccessFlags>();
  const { data, error } = await createServiceClient()
    .from("order_access_flags")
    .select("stripe_session_id, refund_status, refunded_cents, dispute_status, needs_review, note");
  if (error || !data) return out;
  for (const r of data as (OrderAccessFlags & { stripe_session_id: string })[]) out.set(r.stripe_session_id, r);
  return out;
}

// ── Stripe event → order mapping ─────────────────────────────────────────────

export type ResolvedOrder =
  | { kind: "clip-order"; sessionId: string }
  | { kind: "ignored"; reason: string };

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/**
 * Charge/dispute -> the Checkout Session that created the payment (via its PaymentIntent).
 * Merchandise payments (metadata.type = "merch") and anything that is not one of OUR clip checkouts is ignored.
 * A Stripe API failure THROWS, so the webhook answers 500 and Stripe retries the event.
 */
export async function resolveClipOrder(stripe: Stripe, paymentIntentId: string | null): Promise<ResolvedOrder> {
  if (!paymentIntentId) return { kind: "ignored", reason: "no payment intent" };
  const list = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const session = list.data[0];
  if (!session) return { kind: "ignored", reason: "not a Checkout payment" };
  if (session.metadata?.type === "merch") return { kind: "ignored", reason: "merchandise order" };
  const hasClips = !!(session.metadata?.clip_ids || session.metadata?.clip_id);
  if (!hasClips) return { kind: "ignored", reason: "not a clip order" };
  return { kind: "clip-order", sessionId: session.id };
}

async function paymentIntentOfDispute(stripe: Stripe, dispute: Stripe.Dispute): Promise<string | null> {
  const direct = idOf(dispute.payment_intent as string | { id: string } | null);
  if (direct) return direct;
  const chargeId = idOf(dispute.charge as string | { id: string });
  if (!chargeId) return null;
  const charge = await stripe.charges.retrieve(chargeId);
  return idOf(charge.payment_intent as string | { id: string } | null);
}

async function readFlags(sessionId: string): Promise<Partial<OrderAccessFlags> | null> {
  const { data, error } = await createServiceClient()
    .from("order_access_flags")
    .select("refund_status, refunded_cents, dispute_status, needs_review, stripe_dispute_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`order access lookup: ${error.message}`);
  return (data as Partial<OrderAccessFlags> | null) ?? null;
}

async function writeFlags(sessionId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await createServiceClient()
    .from("order_access_flags")
    .upsert({ stripe_session_id: sessionId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "stripe_session_id" });
  if (error) throw new Error(`order access write: ${error.message}`);
}

const RANK = { none: 0, partial: 1, full: 2 } as const;

export interface EventOutcome {
  handled: boolean;
  detail: string;
}

/** charge.refunded: full refund revokes; partial only flags the order for manual review. Never downgrades. */
export async function handleChargeRefunded(stripe: Stripe, charge: Stripe.Charge): Promise<EventOutcome> {
  const order = await resolveClipOrder(stripe, idOf(charge.payment_intent as string | { id: string } | null));
  if (order.kind === "ignored") return { handled: false, detail: order.reason };

  const amount = typeof charge.amount === "number" ? charge.amount : 0;
  const refunded = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;
  if (refunded <= 0) return { handled: false, detail: "nothing refunded" };
  const isFull = charge.refunded === true || (amount > 0 && refunded >= amount);

  const existing = await readFlags(order.sessionId);
  const prev = existing?.refund_status ?? "none";
  const next = isFull ? "full" : "partial";
  const status = RANK[next] >= RANK[prev] ? next : prev; // out-of-order events can never un-refund
  const cents = Math.max(existing?.refunded_cents ?? 0, refunded);

  await writeFlags(order.sessionId, {
    refund_status: status,
    refunded_cents: cents,
    stripe_charge_id: charge.id,
    needs_review: status === "partial" ? true : existing?.needs_review ?? false,
    note:
      status === "partial"
        ? `Partial refund of ${(cents / 100).toFixed(2)} of ${(amount / 100).toFixed(2)}. Stripe does not say which item it covers: review manually.`
        : `Full refund of ${(cents / 100).toFixed(2)}.`,
  });
  return { handled: true, detail: `refund ${status}` };
}

/** charge.dispute.created -> open (downloads suspended). charge.dispute.closed -> won restores, lost keeps revoked. */
export async function handleDispute(
  stripe: Stripe,
  dispute: Stripe.Dispute,
  eventType: "charge.dispute.created" | "charge.dispute.closed",
): Promise<EventOutcome> {
  const order = await resolveClipOrder(stripe, await paymentIntentOfDispute(stripe, dispute));
  if (order.kind === "ignored") return { handled: false, detail: order.reason };

  const existing = await readFlags(order.sessionId);
  const sameDispute = existing?.stripe_dispute_id === dispute.id;

  if (eventType === "charge.dispute.created") {
    // A late "created" for a dispute we already know is closed must not re-open it.
    if (sameDispute && (existing?.dispute_status === "won" || existing?.dispute_status === "lost")) {
      return { handled: false, detail: "dispute already closed" };
    }
    await writeFlags(order.sessionId, {
      dispute_status: "open",
      stripe_dispute_id: dispute.id,
      note: `Dispute opened (${dispute.reason ?? "unknown reason"}). Downloads suspended until it closes.`,
    });
    return { handled: true, detail: "dispute open" };
  }

  // closed
  if (dispute.status === "lost") {
    await writeFlags(order.sessionId, { dispute_status: "lost", stripe_dispute_id: dispute.id, note: "Dispute lost. Access stays revoked." });
    return { handled: true, detail: "dispute lost" };
  }
  if (dispute.status === "won" || dispute.status === "warning_closed" || dispute.status === "prevented") {
    await writeFlags(order.sessionId, { dispute_status: "won", stripe_dispute_id: dispute.id, note: "Dispute resolved in your favor. Access restored (unless refunded)." });
    return { handled: true, detail: "dispute won" };
  }
  // Unknown closing status: stay suspended and ask for a human decision.
  await writeFlags(order.sessionId, {
    dispute_status: "open",
    stripe_dispute_id: dispute.id,
    needs_review: true,
    note: `Dispute closed with an unrecognized status "${dispute.status}". Review manually.`,
  });
  return { handled: true, detail: "dispute unrecognized: left suspended" };
}
