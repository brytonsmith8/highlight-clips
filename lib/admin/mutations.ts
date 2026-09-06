import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { removeClipFiles } from "@/lib/storage";
import { DOWNLOAD_WINDOW_HOURS } from "@/lib/orders";

/**
 * Destructive admin operations, kept as plain server helpers (no auth check of
 * their own — every caller is a `"use server"` action that runs
 * `requireAdmin()` first). Each returns a structured result instead of
 * throwing, so the admin UI can show exactly what happened.
 *
 * The production schema has **no foreign keys** between games / athletes /
 * clips / purchases, so nothing here can lean on ON DELETE behaviour — every
 * relationship is walked explicitly, and anything that would strand a paying
 * customer is blocked unless `force` is passed.
 */

export type MutationResult = { ok: boolean; message: string };

function expiryLabel(from: Date): string {
  return new Date(
    from.getTime() + DOWNLOAD_WINDOW_HOURS * 60 * 60 * 1000,
  ).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** Delete one clip. Blocked when it has purchases unless `force` (which then
 * also deletes those purchase rows). Removes the stored preview + original. */
export async function deleteClipCascade(
  clipId: string,
  opts: { force?: boolean } = {},
): Promise<MutationResult> {
  const supabase = createServiceClient();

  const { data: clip } = await supabase
    .from("clips")
    .select("id, preview_url, full_url")
    .eq("id", clipId)
    .maybeSingle();
  if (!clip) return { ok: false, message: "Clip not found — it may already be deleted." };

  const { count } = await supabase
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("clip_id", clipId);
  const purchaseCount = count ?? 0;

  if (purchaseCount > 0 && !opts.force) {
    return {
      ok: false,
      message: `Blocked: this clip has ${purchaseCount} purchase(s). Unpublish it instead, or use Force delete to also erase those ${purchaseCount} purchase record(s) and their downloads.`,
    };
  }

  let removedPurchases = 0;
  if (purchaseCount > 0 && opts.force) {
    const { error, count: delCount } = await supabase
      .from("purchases")
      .delete({ count: "exact" })
      .eq("clip_id", clipId);
    if (error) {
      return { ok: false, message: `Could not remove purchase records: ${error.message}` };
    }
    removedPurchases = delCount ?? 0;
  }

  const { error: clipError } = await supabase.from("clips").delete().eq("id", clipId);
  if (clipError) {
    return { ok: false, message: `Clip row delete failed: ${clipError.message}` };
  }

  const fileStatus = await removeClipFiles(clip);

  return {
    ok: true,
    message: `Clip deleted. Storage — ${fileStatus}. Purchase records removed: ${removedPurchases}.`,
  };
}

/** Delete a game and every clip under it. Blocked when any of those clips has
 * purchases unless `force`. */
export async function deleteGameCascade(
  gameId: string,
  opts: { force?: boolean } = {},
): Promise<MutationResult> {
  const supabase = createServiceClient();

  const { data: game } = await supabase
    .from("games")
    .select("id, school_a, school_b")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return { ok: false, message: "Game not found — it may already be deleted." };

  const { data: clips } = await supabase
    .from("clips")
    .select("id, preview_url, full_url")
    .eq("game_id", gameId);
  const clipRows = clips ?? [];

  let purchaseCount = 0;
  if (clipRows.length > 0) {
    const { count } = await supabase
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .in(
        "clip_id",
        clipRows.map((c) => c.id),
      );
    purchaseCount = count ?? 0;
  }

  if (purchaseCount > 0 && !opts.force) {
    return {
      ok: false,
      message: `Blocked: ${clipRows.length} clip(s) under "${game.school_a} vs ${game.school_b}" have ${purchaseCount} purchase(s) between them. Use Force delete to erase the clips, their files, and those ${purchaseCount} purchase record(s).`,
    };
  }

  let removedPurchases = 0;
  for (const clip of clipRows) {
    if (opts.force) {
      const { count: delCount } = await supabase
        .from("purchases")
        .delete({ count: "exact" })
        .eq("clip_id", clip.id);
      removedPurchases += delCount ?? 0;
    }
    await supabase.from("clips").delete().eq("id", clip.id);
    await removeClipFiles(clip);
  }

  const { error } = await supabase.from("games").delete().eq("id", gameId);
  if (error) return { ok: false, message: `Game row delete failed: ${error.message}` };

  return {
    ok: true,
    message: `Deleted "${game.school_a} vs ${game.school_b}", ${clipRows.length} clip(s), and ${removedPurchases} purchase record(s).`,
  };
}

/** Delete an athlete. Never blocked: clips that referenced it keep everything
 * else and simply become unlabeled (`athlete_id` set to null). */
export async function unlabelAndDeleteAthlete(
  athleteId: string,
): Promise<MutationResult> {
  const supabase = createServiceClient();

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, name")
    .eq("id", athleteId)
    .maybeSingle();
  if (!athlete) {
    return { ok: false, message: "Athlete not found — it may already be deleted." };
  }

  const { count } = await supabase
    .from("clips")
    .select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId);
  const clipCount = count ?? 0;

  if (clipCount > 0) {
    const { error } = await supabase
      .from("clips")
      .update({ athlete_id: null })
      .eq("athlete_id", athleteId);
    if (error) {
      return { ok: false, message: `Could not unlink clips: ${error.message}` };
    }
  }

  const { error } = await supabase.from("athletes").delete().eq("id", athleteId);
  if (error) return { ok: false, message: `Delete failed: ${error.message}` };

  return {
    ok: true,
    message: `Deleted "${athlete.name}". ${clipCount} clip(s) kept and are now unlabeled.`,
  };
}

/** Delete every purchase row for one Stripe Checkout Session (one "order"). */
export async function deleteOrderByToken(token: string): Promise<MutationResult> {
  const supabase = createServiceClient();

  const { data: rows } = await supabase
    .from("purchases")
    .select("id, buyer_email")
    .eq("stripe_payment_id", token);
  if (!rows || rows.length === 0) {
    return { ok: false, message: "No purchase records found for that order." };
  }

  const { error, count } = await supabase
    .from("purchases")
    .delete({ count: "exact" })
    .eq("stripe_payment_id", token);
  if (error) return { ok: false, message: `Delete failed: ${error.message}` };

  return {
    ok: true,
    message: `Deleted ${count ?? rows.length} purchase record(s) for ${rows[0].buyer_email}. That download link no longer works.`,
  };
}

/**
 * Give an order a fresh {@link DOWNLOAD_WINDOW_HOURS}-hour window. The schema
 * stores only `purchased_at` (expiry is derived at request time), so the only
 * lever is to move `purchased_at` forward to now — applied to every row in the
 * order so a multi-clip purchase stays consistent.
 */
export async function resetDownloadWindow(token: string): Promise<MutationResult> {
  const supabase = createServiceClient();

  const { data: rows } = await supabase
    .from("purchases")
    .select("id")
    .eq("stripe_payment_id", token);
  if (!rows || rows.length === 0) {
    return { ok: false, message: "No purchase records found for that order." };
  }

  const now = new Date();
  const { error } = await supabase
    .from("purchases")
    .update({ purchased_at: now.toISOString() })
    .eq("stripe_payment_id", token);
  if (error) return { ok: false, message: `Update failed: ${error.message}` };

  return {
    ok: true,
    message: `Download window reset for ${rows.length} item(s). New expiry: ${expiryLabel(now)}.`,
  };
}
