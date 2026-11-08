/**
 * Highlight-clip pricing. ONE place, used by the server (checkout) and the browser (cart display).
 * The server always recomputes the price itself; a price sent by the browser is never trusted.
 *
 * - 1 to 3 clips: $12.50 each.
 * - 4 or more clips: EVERY clip in the purchase is $10.50.
 *
 * All math is in whole cents so there is never a rounding error.
 */
export const INDIVIDUAL_PRICE_CENTS = 1250;
export const BUNDLE_PRICE_CENTS = 1050;
export const BUNDLE_MIN_CLIPS = 4;
/** Stripe metadata values are capped at 500 characters; 12 clip ids fit with room to spare. */
export const MAX_CLIPS_PER_ORDER = 12;

export interface CartPrice {
  count: number;
  bundleApplied: boolean;
  /** What each clip costs in this purchase. */
  unitCents: number;
  /** count x $12.50 */
  originalCents: number;
  /** Bundle savings (0 below 4 clips). */
  savingsCents: number;
  /** What the customer pays. */
  totalCents: number;
}

export function priceForCount(count: number): CartPrice {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  const bundleApplied = n >= BUNDLE_MIN_CLIPS;
  const unitCents = bundleApplied ? BUNDLE_PRICE_CENTS : INDIVIDUAL_PRICE_CENTS;
  const originalCents = n * INDIVIDUAL_PRICE_CENTS;
  const totalCents = n * unitCents;
  return {
    count: n,
    bundleApplied,
    unitCents,
    originalCents,
    savingsCents: originalCents - totalCents,
    totalCents,
  };
}

/** 1250 -> "$12.50" */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** How many more clips unlock the bundle price (0 when already unlocked). */
export function clipsToBundle(count: number): number {
  return Math.max(0, BUNDLE_MIN_CLIPS - count);
}
