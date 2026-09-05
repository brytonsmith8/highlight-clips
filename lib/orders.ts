import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

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
