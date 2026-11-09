import "server-only";

import type Stripe from "stripe";

import { sendOrderConfirmationEmail } from "@/lib/email";
import { computeDownloadExpiry } from "@/lib/orders";
import {
  nextScripture,
  scriptureByReference,
  scriptureForOrder,
  type Scripture,
} from "@/lib/scriptures";
import { createServiceClient } from "@/lib/supabase/service";
import { recordEditOrder } from "@/lib/edit-orders";

/**
 * Recording a PAID clip checkout. Used by both the Stripe webhook and the order page's
 * "webhook has not landed yet" self-heal, so the two can never disagree.
 *
 * - Every clip in the checkout gets one `purchases` row (same session id = the access token).
 * - The whole order gets ONE Scripture, saved on every row of the order.
 * - Idempotent: clips already recorded for this session are skipped, so a Stripe retry or a
 *   webhook + self-heal race can't double-record or send a second email.
 */

/** Clip ids bought in one session: `clip_ids` (comma separated) or the older single `clip_id`. */
export function clipIdsFromSession(session: Pick<Stripe.Checkout.Session, "metadata">): string[] {
  const raw = session.metadata?.clip_ids ?? session.metadata?.clip_id ?? "";
  return Array.from(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)));
}

function isMissingScriptureColumn(message: string | undefined): boolean {
  return !!message && /scripture/i.test(message);
}

/** The Scripture saved with an order; falls back to a stable per-order verse if none is saved. */
export async function getOrderScripture(token: string): Promise<Scripture> {
  try {
    const { data, error } = await createServiceClient()
      .from("purchases")
      .select("scripture")
      .eq("stripe_payment_id", token)
      .not("scripture", "is", null)
      .limit(1);
    if (!error) {
      const saved = scriptureByReference((data as { scripture: string }[] | null)?.[0]?.scripture);
      if (saved) return saved;
    }
  } catch {
    // fall through to the stable fallback
  }
  return scriptureForOrder(token);
}

/** The next verse in the rotation (the verse after the most recent order's). */
async function pickNewScripture(token: string): Promise<Scripture> {
  try {
    const { data, error } = await createServiceClient()
      .from("purchases")
      .select("scripture, purchased_at")
      .not("scripture", "is", null)
      .order("purchased_at", { ascending: false })
      .limit(1);
    if (error) return scriptureForOrder(token);
    const last = (data as { scripture: string }[] | null)?.[0]?.scripture;
    return last ? nextScripture(last) : scriptureByReference("Isaiah 40:31") ?? scriptureForOrder(token);
  } catch {
    return scriptureForOrder(token);
  }
}

export interface RecordResult {
  /** True when this call created the purchase rows (and sent the email). */
  recorded: boolean;
}

/**
 * Records everything a PAID session bought: the clips (and email) and, when present, the BRYT VISION EDIT
 * order. The edit step runs even when the clips were already recorded, so a Stripe retry after a failed edit
 * write completes it; both steps are idempotent.
 */
export async function recordClipPurchase(session: Stripe.Checkout.Session): Promise<RecordResult> {
  const result = await recordClipsOnly(session);
  await recordEditOrder(session);
  return result;
}

async function recordClipsOnly(session: Stripe.Checkout.Session): Promise<RecordResult> {
  const clipIds = clipIdsFromSession(session);
  const buyerEmail = session.customer_details?.email ?? session.customer_email ?? null;
  if (clipIds.length === 0 || !buyerEmail) {
    console.error("[clip orders] session missing clip ids or buyer email:", session.id);
    return { recorded: false };
  }

  const supabase = createServiceClient();

  const { data: existing, error: existingError } = await supabase
    .from("purchases")
    .select("clip_id")
    .eq("stripe_payment_id", session.id);
  if (existingError) throw new Error(existingError.message);

  const have = new Set((existing ?? []).map((r: { clip_id: string }) => r.clip_id));
  const missing = clipIds.filter((id) => !have.has(id));
  if (missing.length === 0) return { recorded: false };

  let scripture = await pickNewScripture(session.id);
  const purchasedAt = new Date().toISOString();
  const rows = missing.map((clipId) => ({
    id: crypto.randomUUID(),
    clip_id: clipId,
    buyer_email: buyerEmail,
    stripe_payment_id: session.id,
    purchased_at: purchasedAt,
  }));

  let { error } = await supabase
    .from("purchases")
    .insert(rows.map((r) => ({ ...r, scripture: scripture.reference })));
  if (error && isMissingScriptureColumn(error.message)) {
    // The optional `scripture` column has not been added yet: record without it. The order page
    // and email then use the stable per-order verse, so they still always agree.
    ({ error } = await supabase.from("purchases").insert(rows));
    scripture = scriptureForOrder(session.id);
  }
  if (error) throw new Error(error.message);

  // Only the first recording of an order emails the customer (a retry returned above).
  if (have.size === 0) {
    try {
      const { data: clips } = await supabase.from("clips").select("id, game_id").in("id", clipIds);
      const gameIds = Array.from(new Set((clips ?? []).map((c: { game_id: string }) => c.game_id)));
      const { data: gameRows } = gameIds.length
        ? await supabase.from("games").select("id, school_a, school_b").in("id", gameIds)
        : { data: [] };
      const gameById = new Map(
        (gameRows ?? []).map((g: { id: string; school_a: string; school_b: string }) => [g.id, g]),
      );
      const clipGame = new Map((clips ?? []).map((c: { id: string; game_id: string }) => [c.id, gameById.get(c.game_id)]));
      await sendOrderConfirmationEmail({
        to: buyerEmail,
        token: session.id,
        clips: clipIds.map((id) => ({
          schoolA: clipGame.get(id)?.school_a ?? "Unknown",
          schoolB: clipGame.get(id)?.school_b ?? "Unknown",
        })),
        expiresAt: computeDownloadExpiry(purchasedAt),
        scripture: { reference: scripture.reference, text: scripture.text },
        totalDollars: typeof session.amount_total === "number" ? session.amount_total / 100 : undefined,
      });
    } catch (emailError) {
      // The purchase is recorded either way; an email failure must not fail the order.
      console.error("[clip orders] failed to send confirmation email:", emailError);
    }
  }

  return { recorded: true };
}
