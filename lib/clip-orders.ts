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

export async function recordClipPurchase(session: Stripe.Checkout.Session): Promise<RecordResult> {
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
      const gameId = (clips ?? [])[0]?.game_id;
      const { data: game } = gameId
        ? await supabase.from("games").select("school_a, school_b").eq("id", gameId).maybeSingle()
        : { data: null };
      await sendOrderConfirmationEmail({
        to: buyerEmail,
        token: session.id,
        clips: clipIds.map(() => ({
          schoolA: game?.school_a ?? "Unknown",
          schoolB: game?.school_b ?? "Unknown",
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
