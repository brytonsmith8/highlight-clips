import { priceForCount } from "@/lib/pricing";

/**
 * BRYT VISION EDIT + FREE SHIRT add-on. Pure rules shared by the browser (cart) and the server (checkout).
 * The server NEVER trusts the browser: /api/checkout re-checks everything here against the database.
 *
 * - Fixed $55 add-on on top of the normal clip price (it does NOT replace bundle pricing).
 * - Needs at least 7 selected clips that belong to the SAME athlete profile (athlete id, never jersey number).
 * - The clips may come from different games and dates.
 */
export const EDIT_PRICE_CENTS = 5500;
export const EDIT_MIN_CLIPS = 7;
export const EDIT_TITLE = "BRYT VISION EDIT + FREE SHIRT";

export const EDIT_STATUSES = [
  { id: "awaiting_payment", label: "Awaiting payment" },
  { id: "paid_editing_needed", label: "Paid — editing needed" },
  { id: "editing_in_progress", label: "Editing in progress" },
  { id: "edit_completed", label: "Edit completed" },
  { id: "shirt_ready_to_ship", label: "Shirt ready to ship" },
  { id: "fulfilled", label: "Shipped / fulfilled" },
] as const;
export type EditStatus = (typeof EDIT_STATUSES)[number]["id"];

export function editStatusLabel(id: string): string {
  return EDIT_STATUSES.find((s) => s.id === id)?.label ?? id;
}

/** Statuses an admin may set by hand. Payment status is only ever set by the verified Stripe webhook. */
export const ADMIN_SETTABLE_STATUSES: readonly EditStatus[] = [
  "paid_editing_needed",
  "editing_in_progress",
  "edit_completed",
  "shirt_ready_to_ship",
  "fulfilled",
];

export interface AthleteClipRef {
  athleteId: string | null;
}

/** How many of the given clips belong to each known athlete (clips with no athlete never count). */
export function countByAthlete(clips: AthleteClipRef[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of clips) {
    if (!c.athleteId) continue;
    counts.set(c.athleteId, (counts.get(c.athleteId) ?? 0) + 1);
  }
  return counts;
}

export interface EditEligibility {
  /** Athletes with at least EDIT_MIN_CLIPS selected clips, most clips first. */
  qualifying: string[];
  /** The athlete closest to (or past) the minimum, for the "x of 7" progress text. */
  bestAthleteId: string | null;
  bestCount: number;
  /** More clips of the best athlete needed to unlock (0 when unlocked). */
  needed: number;
  unlocked: boolean;
}

export function editEligibility(clips: AthleteClipRef[]): EditEligibility {
  const counts = [...countByAthlete(clips).entries()].sort((a, b) => b[1] - a[1]);
  const qualifying = counts.filter(([, n]) => n >= EDIT_MIN_CLIPS).map(([id]) => id);
  const best = counts[0];
  const bestCount = best ? best[1] : 0;
  return {
    qualifying,
    bestAthleteId: best ? best[0] : null,
    bestCount,
    needed: Math.max(0, EDIT_MIN_CLIPS - bestCount),
    unlocked: qualifying.length > 0,
  };
}

/** True when `athleteId` has enough of the given clips. Used by the server with database rows. */
export function athleteQualifies(clips: AthleteClipRef[], athleteId: string): boolean {
  return (countByAthlete(clips).get(athleteId) ?? 0) >= EDIT_MIN_CLIPS;
}

export interface OrderTotals {
  clipCount: number;
  clipTotalCents: number;
  editCents: number;
  totalCents: number;
}

/** Clips keep their normal $12.50 / $10.50 pricing; the edit is a fixed extra $55. */
export function orderTotals(clipCount: number, withEdit: boolean): OrderTotals {
  const clipTotalCents = priceForCount(clipCount).totalCents;
  const editCents = withEdit ? EDIT_PRICE_CENTS : 0;
  return { clipCount, clipTotalCents, editCents, totalCents: clipTotalCents + editCents };
}
