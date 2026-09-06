/**
 * Whether a `clips.preview_url` should actually be rendered in a `<video>`.
 *
 * Some rows (seed / hand-entered test clips) carry the placeholder
 * `https://example.com/preview.mp4`, which renders as a broken black box that
 * looks identical to a real player that failed to load. For those we show the
 * styled "Preview unavailable" placeholder instead.
 */
export function isPlayablePreviewUrl(
  url: string | null | undefined,
): url is string {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "example.com" || host === "example.org" || host === "example.net") {
    return false;
  }
  if (
    host.endsWith(".example.com") ||
    host.endsWith(".example.org") ||
    host.endsWith(".example.net")
  ) {
    return false;
  }
  return true;
}
