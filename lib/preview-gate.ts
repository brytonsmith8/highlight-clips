import "server-only";

import { isPlayablePreviewUrl } from "@/lib/preview";
import {
  clipPreviewObjectKeyFromUrl,
  previewHasProtectionMark,
} from "@/lib/storage";

/**
 * Fail-closed public display gate. A preview file is only ever put in a
 * public <video> if the file itself carries the BRYT preview protection tag
 * (written by the server-side blur + watermark maker). Older / hand-uploaded
 * previews without the tag are hidden, and anything unreadable counts as
 * "not protected". This changes no data; it only decides what the page renders.
 */
const OK_TTL_MS = 10 * 60_000;
const BAD_TTL_MS = 30_000;
const cache = new Map<string, { ok: boolean; at: number }>();

export async function checkPreviewPublic(
  previewUrl: string | null | undefined,
  check: (key: string) => Promise<boolean> = previewHasProtectionMark,
  now: () => number = Date.now,
): Promise<boolean> {
  if (!isPlayablePreviewUrl(previewUrl)) return false;
  const key = clipPreviewObjectKeyFromUrl(previewUrl);
  if (!key) return false;
  const hit = cache.get(key);
  const t = now();
  if (hit && t - hit.at < (hit.ok ? OK_TTL_MS : BAD_TTL_MS)) return hit.ok;
  let ok = false;
  try {
    ok = await check(key);
  } catch {
    ok = false;
  }
  cache.set(key, { ok, at: t });
  return ok;
}

/** Test helper. */
export function _resetPreviewGateCache() {
  cache.clear();
}
