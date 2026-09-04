/** Formatting helpers shared by server and client components. */

/** `clips.price` is confirmed to be whole dollars (e.g. 15 -> "$15.00"). */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
}

/** "YYYY-MM-DD" -> "September 12, 2026" (parsed as a local date, no TZ shift). */
export function formatGameDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
