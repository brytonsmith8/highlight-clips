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


type PurchaseRowInput = { id: string; clip_id: string; buyer_email: string; stripe_payment_id: string; purchased_at: string };
type InsertResult = { count: number } | { missingScripture: true } | { error: string };

function isNoUniqueIndexError(error: { message?: string; code?: string }): boolean {
  return error.code === "42P10" || /no unique or exclusion constraint/i.test(error.message ?? "");
}

/**
 * Insert purchase rows at most once per (order, clip). Returns how many rows THIS call actually inserted.
 * - Normal path: INSERT .. ON CONFLICT DO NOTHING (needs the unique index from migration 0008).
 * - Before 0008 is applied: falls back to the previous plain insert (the race window then still exists).
 * - A duplicate-key error means another request already recorded the rows: counted as 0 inserted, not a failure.
 */
async function insertPurchases(
  supabase: ReturnType<typeof createServiceClient>,
  rows: PurchaseRowInput[],
  scriptureRef: string | null,
): Promise<InsertResult> {
  const payload = rows.map((r) => (scriptureRef ? { ...r, scripture: scriptureRef } : r));
  const up = await supabase
    .from("purchases")
    .upsert(payload, { onConflict: "stripe_payment_id,clip_id", ignoreDuplicates: true })
    .select("id");
  if (!up.error) return { count: (up.data ?? []).length };
  if (up.error.code === "23505") return { count: 0 };
  if (scriptureRef && isMissingScriptureColumn(up.error.message)) return { missingScripture: true };
  if (isNoUniqueIndexError(up.error)) {
    const ins = await supabase.from("purchases").insert(payload);
    if (!ins.error) return { count: payload.length };
    if (ins.error.code === "23505") return { count: 0 };
    if (scriptureRef && isMissingScriptureColumn(ins.error.message)) return { missingScripture: true };
    return { error: ins.error.message };
  }
  return { error: up.error.message };
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

  // Record atomically and idempotently. One statement, ON CONFLICT DO NOTHING on (stripe_payment_id, clip_id)
  // (unique index from migration 0008): when the webhook and the order page race, exactly ONE of them inserts
  // each row, and the other gets back zero inserted rows. Only the request that really inserted rows may email.
  let inserted = await insertPurchases(supabase, rows, scripture.reference);
  if ("missingScripture" in inserted) {
    // The optional `scripture` column has not been added yet: record without it. The order page
    // and email then use the stable per-order verse, so they still always agree.
    scripture = scriptureForOrder(session.id);
    inserted = await insertPurchases(supabase, rows, null);
  }
  if ("error" in inserted) throw new Error(inserted.error);
  if ("missingScripture" in inserted) throw new Error("purchases insert failed");
  const insertedCount = inserted.count;

  // Only the request that created the order's rows emails the customer (a retry or a losing racer inserts 0).
  if (have.size === 0 && insertedCount > 0) {
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
      let edit: { size: string; color: string; sleeve: string | null; athleteLabel: string | null } | undefined;
      if (session.metadata?.edit === "1") {
        let athleteLabel: string | null = null;
        const aid = session.metadata?.edit_athlete_id;
        if (aid) {
          const { data: a } = await supabase.from("athletes").select("name, jersey_number").eq("id", aid).maybeSingle();
          const ar = a as { name: string | null; jersey_number: string | null } | null;
          if (ar) athleteLabel = [ar.jersey_number ? `#${ar.jersey_number}` : "", ar.name ?? ""].filter(Boolean).join(" ") || null;
        }
        edit = {
          size: session.metadata?.edit_size ?? "",
          color: session.metadata?.edit_color ?? "",
          sleeve: session.metadata?.edit_sleeve ?? null,
          athleteLabel,
        };
      }
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
        edit,
      });
    } catch (emailError) {
      // The purchase is recorded either way; an email failure must not fail the order.
      console.error("[clip orders] failed to send confirmation email:", emailError);
    }
  }

  return { recorded: insertedCount > 0 };
}
