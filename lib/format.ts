/** Formatting helpers shared by server and client components. */

/** Integer cents → a localized currency string, e.g. 500 → "$5.00". */
export function formatPrice(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** "YYYY-MM-DD" → "September 12, 2026" (parsed as a local date, no TZ shift). */
export function formatGameDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export interface ExpiryInfo {
  expired: boolean;
  /** Whole days remaining (floored), 0 once inside the final day. */
  daysLeft: number;
  /** Whether the game is close enough to expiry to warrant a warning style. */
  urgent: boolean;
  /** Human label for the public game page. */
  label: string;
}

/**
 * Describe how long a game's public availability has left, from its
 * `expires_at`. Game expiration only — unrelated to a customer's post-purchase
 * download window.
 */
export function getExpiryInfo(expiresAt: string, now: Date = new Date()): ExpiryInfo {
  const remainingMs = new Date(expiresAt).getTime() - now.getTime();

  if (remainingMs <= 0) {
    return { expired: true, daysLeft: 0, urgent: true, label: "Expired" };
  }

  const hoursLeft = remainingMs / 3_600_000;
  const daysLeft = Math.floor(hoursLeft / 24);
  const urgent = hoursLeft <= 72;

  let label: string;
  if (hoursLeft <= 24) label = "Expires today";
  else if (daysLeft === 1) label = "Expires tomorrow";
  else if (daysLeft <= 3) label = `Expires in ${daysLeft} days`;
  else label = `Highlights available for ${daysLeft} more days`;

  return { expired: false, daysLeft, urgent, label };
}
