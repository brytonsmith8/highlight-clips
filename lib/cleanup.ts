import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { CLIP_ORIGINALS_BUCKET } from "@/lib/storage";
import { DOWNLOAD_WINDOW_HOURS } from "@/lib/orders";
import { isMissingRelationError } from "@/lib/order-access";

/**
 * Scheduled cleanup of full-quality originals nobody needs any more.
 *
 * An original is removed ONLY when every one of these is true:
 *   1. the clip is unpublished (not for sale), and
 *   2. it was sold at least once (a brand-new, never-sold upload is never touched), and
 *   3. every buyer's download window ended more than CLEANUP_GRACE_HOURS ago, and
 *   4. its `full_url` is a file in our private bucket (external links are left alone), and
 *   5. it is NOT source footage for a paid BRYT VISION EDIT that is still unfinished (the customer's 72-hour clip
 *      window is shorter than the 5-7 day edit). If that cannot be checked, NOTHING is deleted.
 *
 * It never deletes purchase records (orders are kept permanently), never touches published clips,
 * and never reacts to a preview or a signed link expiring. Conditions are re-checked immediately
 * before each delete (an admin may have just extended a window or republished the clip). Safe to
 * run any number of times: a clip that is already cleaned has no `full_url` and is skipped.
 */

/** Extra time after the last window closes, so an admin can still extend an order. */
export const CLEANUP_GRACE_HOURS = 24;
/** Clips handled per run, to stay well inside the function time limit; the next run continues. */
export const CLEANUP_BATCH = 25;

const HOUR_MS = 3600 * 1000;

const UNFINISHED_EDIT_STATUSES = ["paid_editing_needed", "editing_in_progress"];

/**
 * Clip ids that are still needed as source footage: every clip of a PAID BRYT VISION EDIT order whose edit is not
 * finished. Combines the order's clip snapshot AND the clips actually purchased under that order, so a malformed
 * snapshot cannot hide a clip. Orders that were fully refunded or whose dispute was lost no longer need protection;
 * an OPEN dispute keeps it (footage is kept while unresolved).
 *
 * THROWS if anything cannot be read (except "edit_orders table does not exist yet", which means no EDIT orders
 * exist). Callers treat a throw as "delete nothing".
 */
export async function loadClipsNeededForEdits(): Promise<Set<string>> {
  const supabase = createServiceClient();
  const needed = new Set<string>();

  const { data: orders, error } = await supabase
    .from("edit_orders")
    .select("stripe_session_id, clips")
    .eq("payment_status", "paid")
    .in("status", UNFINISHED_EDIT_STATUSES);
  if (error) {
    if (isMissingRelationError(error)) return needed;
    throw new Error(`edit order lookup failed: ${error.message}`);
  }
  const rows = (orders ?? []) as { stripe_session_id: string; clips: { clipId?: string }[] | null }[];
  if (rows.length === 0) return needed;

  // Orders that no longer need their footage (full refund / lost dispute).
  const released = new Set<string>();
  const flags = await supabase
    .from("order_access_flags")
    .select("stripe_session_id, refund_status, dispute_status")
    .in("stripe_session_id", rows.map((r) => r.stripe_session_id));
  if (flags.error) {
    if (!isMissingRelationError(flags.error)) throw new Error(`order access lookup failed: ${flags.error.message}`);
  } else {
    for (const f of (flags.data ?? []) as { stripe_session_id: string; refund_status: string; dispute_status: string }[]) {
      if (f.refund_status === "full" || f.dispute_status === "lost") released.add(f.stripe_session_id);
    }
  }

  const active = rows.filter((r) => !released.has(r.stripe_session_id));
  for (const r of active) {
    for (const c of Array.isArray(r.clips) ? r.clips : []) if (c?.clipId) needed.add(c.clipId);
  }
  if (active.length > 0) {
    const { data: bought, error: boughtError } = await supabase
      .from("purchases")
      .select("clip_id")
      .in("stripe_payment_id", active.map((r) => r.stripe_session_id));
    if (boughtError) throw new Error(`purchase lookup failed: ${boughtError.message}`);
    for (const p of (bought ?? []) as { clip_id: string }[]) needed.add(p.clip_id);
  }
  return needed;
}

export interface CleanupItem {
  clipId: string;
  outcome: "removed" | "would-remove" | "failed" | "kept";
  detail?: string;
}

export interface CleanupReport {
  dryRun: boolean;
  checked: number;
  removed: number;
  failed: number;
  items: CleanupItem[];
}

/** True when the last purchase's window (plus grace) is over. `purchasedAt` list must be non-empty. */
export function allWindowsClosed(
  purchasedAt: string[],
  now: Date = new Date(),
  graceHours: number = CLEANUP_GRACE_HOURS,
): boolean {
  if (purchasedAt.length === 0) return false; // never sold -> never eligible
  const times = purchasedAt.map((t) => new Date(t).getTime());
  if (times.some((t) => Number.isNaN(t))) return false; // unreadable date -> keep the file
  const last = Math.max(...times);
  return now.getTime() >= last + (DOWNLOAD_WINDOW_HOURS + graceHours) * HOUR_MS;
}

async function eligible(
  clipId: string,
  key: string,
  now: Date,
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: clip } = await supabase
    .from("clips")
    .select("id, published, full_url")
    .eq("id", clipId)
    .maybeSingle();
  if (!clip || clip.published !== false || clip.full_url !== key) return false;

  const { data: purchases, error } = await supabase
    .from("purchases")
    .select("purchased_at")
    .eq("clip_id", clipId);
  if (error) return false;
  return allWindowsClosed((purchases ?? []).map((p) => p.purchased_at), now);
}

export async function cleanupExpiredOriginals(
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<CleanupReport> {
  const { dryRun = false, now = new Date() } = options;
  const supabase = createServiceClient();
  const report: CleanupReport = { dryRun, checked: 0, removed: 0, failed: 0, items: [] };

  // Source footage for unfinished paid EDIT orders is never removed. If this cannot be determined, the whole
  // run stops before touching anything (the cron route answers 500 and tries again tomorrow).
  const neededForEdits = await loadClipsNeededForEdits();

  const { data: candidates, error } = await supabase
    .from("clips")
    .select("id, full_url")
    .eq("published", false);
  if (error) throw new Error(`Could not list clips: ${error.message}`);

  for (const clip of candidates ?? []) {
    if (report.checked >= CLEANUP_BATCH) break;
    const key = clip.full_url as string | null;
    // Already cleaned, or an external link we do not own.
    if (!key || /^https?:\/\//i.test(key)) continue;

    // Another clip pointing at the same file would make removal unsafe.
    const { count: sharing } = await supabase
      .from("clips")
      .select("id", { count: "exact", head: true })
      .eq("full_url", key);
    if ((sharing ?? 0) > 1) continue;

    if (neededForEdits.has(clip.id)) {
      report.items.push({ clipId: clip.id, outcome: "kept", detail: "source footage for an unfinished paid EDIT" });
      continue;
    }
    if (!(await eligible(clip.id, key, now))) continue;
    report.checked++;

    if (dryRun) {
      report.items.push({ clipId: clip.id, outcome: "would-remove" });
      continue;
    }

    // Re-check right before deleting (including a fresh read of the EDIT protection; a failed read aborts the run).
    if ((await loadClipsNeededForEdits()).has(clip.id)) continue;
    if (!(await eligible(clip.id, key, now))) continue;

    const { error: removeError } = await supabase.storage
      .from(CLIP_ORIGINALS_BUCKET)
      .remove([key]);
    if (removeError) {
      report.failed++;
      report.items.push({ clipId: clip.id, outcome: "failed", detail: "storage remove failed" });
      console.error("[cleanup] remove failed:", clip.id, removeError.message);
      continue;
    }

    // Point the clip at nothing so the download route reports "unavailable" instead of a dead file.
    let { error: updateError } = await supabase
      .from("clips")
      .update({ full_url: null })
      .eq("id", clip.id)
      .eq("published", false);
    if (updateError) {
      // The column may be NOT NULL in the live schema; an empty string means the same to the app.
      ({ error: updateError } = await supabase
        .from("clips")
        .update({ full_url: "" })
        .eq("id", clip.id)
        .eq("published", false));
    }
    if (updateError) {
      report.failed++;
      report.items.push({ clipId: clip.id, outcome: "failed", detail: "file removed but clip row not updated" });
      console.error("[cleanup] clip update failed:", clip.id, updateError.message);
      continue;
    }

    report.removed++;
    report.items.push({ clipId: clip.id, outcome: "removed" });
  }

  return report;
}
