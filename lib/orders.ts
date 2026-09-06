import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { getStripeClient } from "@/lib/stripe";
import { sendOrderConfirmationEmail } from "@/lib/email";

/**
 * Purchase/download access, built entirely from the existing `purchases`
 * columns — no schema change.
 *
 * - The private access token IS `purchases.stripe_payment_id` (the Stripe
 *   Checkout Session id): already unique, already high-entropy, already
 *   stored. Every clip bought in one checkout shares the same session id,
 *   so it naturally groups a multi-clip purchase under one link.
 * - The download-expiration window is computed from `purchased_at` at
 *   request time — never persisted — so no `download_expires_at` column
 *   is needed either.
 */

export const DOWNLOAD_WINDOW_HOURS = 72;

export interface PurchaseRow {
  id: string;
  clip_id: string;
  buyer_email: string;
  stripe_payment_id: string;
  purchased_at: string;
}

export function computeDownloadExpiry(purchasedAt: string): Date {
  return new Date(
    new Date(purchasedAt).getTime() + DOWNLOAD_WINDOW_HOURS * 60 * 60 * 1000,
  );
}

export function isDownloadExpired(
  purchasedAt: string,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= computeDownloadExpiry(purchasedAt).getTime();
}

/** All purchases sharing one Stripe Checkout Session id (the access token). */
export async function getPurchasesByToken(token: string): Promise<PurchaseRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("purchases")
    .select("id, clip_id, buyer_email, stripe_payment_id, purchased_at")
    .eq("stripe_payment_id", token)
    .order("purchased_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as PurchaseRow[];
}

/**
 * Purchases for a Stripe Checkout Session id — the version the order page and
 * download route should use.
 *
 * Stripe sends the buyer to `success_url` the instant payment completes, but
 * the `checkout.session.completed` webhook that records the purchase is a
 * separate, asynchronous call from Stripe's servers. The success page can
 * easily win that race (or the webhook can be misconfigured / down), which
 * would show a paying customer "Order not found".
 *
 * So: if no row exists yet, ask Stripe about the session directly and, if it is
 * genuinely paid, record it here. The webhook stays the primary path and is
 * still the only sender of the confirmation email on the normal (no-race) flow;
 * this only emails when it is the one that had to create the row.
 */
export async function getPurchasesForCheckout(
  sessionId: string,
): Promise<PurchaseRow[]> {
  const existing = await getPurchasesByToken(sessionId);
  if (existing.length > 0) return existing;

  // Only Checkout Session ids can be self-healed against Stripe.
  if (!sessionId.startsWith("cs_")) return [];

  let session;
  try {
    session = await getStripeClient().checkout.sessions.retrieve(sessionId);
  } catch {
    return [];
  }

  if (session.payment_status !== "paid") return [];

  const clipId = session.metadata?.clip_id;
  const buyerEmail =
    session.customer_details?.email ?? session.customer_email ?? null;
  if (!clipId || !buyerEmail) return [];

  const supabase = createServiceClient();

  // Re-check right before inserting to narrow the window where the webhook
  // records the same purchase concurrently (the table has no unique index on
  // stripe_payment_id + clip_id).
  const { data: raced } = await supabase
    .from("purchases")
    .select("id")
    .eq("stripe_payment_id", sessionId)
    .eq("clip_id", clipId)
    .maybeSingle();

  if (!raced) {
    const purchasedAt = new Date().toISOString();
    const { error } = await supabase.from("purchases").insert({
      id: crypto.randomUUID(),
      clip_id: clipId,
      buyer_email: buyerEmail,
      stripe_payment_id: sessionId,
      purchased_at: purchasedAt,
    });

    if (error) {
      console.error("[orders] self-heal insert failed:", error.message);
    } else {
      try {
        const { data: clip } = await supabase
          .from("clips")
          .select("price, game_id")
          .eq("id", clipId)
          .maybeSingle();
        const { data: game } = clip
          ? await supabase
              .from("games")
              .select("school_a, school_b")
              .eq("id", clip.game_id)
              .maybeSingle()
          : { data: null };

        await sendOrderConfirmationEmail({
          to: buyerEmail,
          token: sessionId,
          clips: [
            {
              schoolA: game?.school_a ?? "Unknown",
              schoolB: game?.school_b ?? "Unknown",
              priceDollars: clip?.price ?? 0,
            },
          ],
          expiresAt: computeDownloadExpiry(purchasedAt),
        });
      } catch (emailError) {
        console.error(
          "[orders] self-heal confirmation email failed:",
          emailError,
        );
      }
    }
  }

  return getPurchasesByToken(sessionId);
}

/**
 * Re-send the confirmation email for an existing order. Reads only — it never
 * touches the purchase rows or the payment flow, it just rebuilds the same
 * message the webhook sends and hands it to Resend again.
 */
export async function resendOrderConfirmationEmail(
  token: string,
): Promise<{ ok: boolean; message: string }> {
  const purchases = await getPurchasesByToken(token);
  if (purchases.length === 0) {
    return { ok: false, message: "No purchase records found for that order." };
  }

  const supabase = createServiceClient();
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

  try {
    await sendOrderConfirmationEmail({
      to: purchases[0].buyer_email,
      token,
      clips: purchases.map((p) => {
        const clip = clipById.get(p.clip_id);
        const game = clip ? gameById.get(clip.game_id) : undefined;
        return {
          schoolA: game?.school_a ?? "Unknown",
          schoolB: game?.school_b ?? "Unknown",
          priceDollars: clip?.price ?? 0,
        };
      }),
      expiresAt: computeDownloadExpiry(purchases[0].purchased_at),
    });
  } catch (error) {
    return {
      ok: false,
      message: `Email send failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  return { ok: true, message: `Sent to ${purchases[0].buyer_email}.` };
}

/** A single purchased clip within a token, verified to belong to that token. */
export async function getPurchaseForTokenAndClip(
  token: string,
  clipId: string,
): Promise<PurchaseRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("purchases")
    .select("id, clip_id, buyer_email, stripe_payment_id, purchased_at")
    .eq("stripe_payment_id", token)
    .eq("clip_id", clipId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PurchaseRow | null) ?? null;
}
