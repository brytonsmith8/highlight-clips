"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteClipCascade, type MutationResult } from "@/lib/admin/mutations";
import {
  CLIP_ORIGINALS_BUCKET,
  CLIP_PREVIEWS_BUCKET,
  checkPreviewAgainstOriginal,
  clipObjectInfo,
  clipPreviewPublicUrl,
  createClipUploadUrls,
  deleteClipOriginal,
  deleteClipPreview,
  PREVIEW_MAX_HEIGHT,
  previewLooksLikeMp4,
  previewMp4Facts,
  previewVideoSize,
  type ClipUploadUrls,
} from "@/lib/storage";

/**
 * Step 1 of the direct-to-storage upload: hand the browser one-time signed
 * upload URLs. Returns only small strings — no file data passes through here.
 */
export async function startClipUpload(input: {
  originalExt: string;
}): Promise<ClipUploadUrls> {
  await requireAdmin();
  const clipId = crypto.randomUUID();
  return createClipUploadUrls(clipId, input.originalExt);
}

/**
 * Step 2: after the browser has uploaded both files straight to Storage,
 * verify they landed and record the (unpublished) clip row.
 */
export async function finalizeClip(input: {
  clipId: string;
  gameId: string;
  athleteId: string | null;
  price: number;
  previewPath: string;
  originalPath: string;
}) {
  await requireAdmin();

  const { clipId, gameId, athleteId, price, previewPath, originalPath } = input;

  if (!gameId) throw new Error("A game is required.");
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Price must be a non-negative number.");
  }

  // Both paths are derived from the clip id by startClipUpload; refuse anything else.
  if (previewPath !== `${clipId}.mp4` || !originalPath.startsWith(`${clipId}.`)) {
    throw new Error("Unexpected upload paths.");
  }

  const [previewInfo, originalInfo] = await Promise.all([
    clipObjectInfo(CLIP_PREVIEWS_BUCKET, previewPath),
    clipObjectInfo(CLIP_ORIGINALS_BUCKET, originalPath),
  ]);
  if (!previewInfo || !originalInfo) {
    await deleteClipPreview(previewPath);
    await deleteClipOriginal(originalPath);
    throw new Error("Upload did not complete — please try again.");
  }

  // The public preview must be a small MP4, smaller than the original.
  const size = await previewVideoSize(previewPath);
  const facts = await previewMp4Facts(previewPath);
  const problem =
    checkPreviewAgainstOriginal(previewInfo, originalInfo) ??
    ((await previewLooksLikeMp4(previewPath))
      ? null
      : "The preview file is not a valid MP4.") ??
    (size && size.height <= PREVIEW_MAX_HEIGHT
      ? null
      : "The preview must be a small, blurred video (720 pixels tall or less).") ??
    (facts?.hasH264 && facts.hasAac
      ? null
      : "The preview must be H.264 video with AAC audio.") ??
    (facts?.hasEmptyEdit ||
    (facts?.videoStart ?? 0) > 0.5 ||
    (facts?.audioStart ?? 0) > 0.5
      ? "The preview has a timing fault (late start). Please try again."
      : null);
  if (problem) {
    await deleteClipPreview(previewPath);
    await deleteClipOriginal(originalPath);
    throw new Error(problem);
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("clips").insert({
    id: clipId,
    game_id: gameId,
    athlete_id: athleteId || null,
    price,
    preview_url: clipPreviewPublicUrl(previewPath),
    full_url: originalPath, // object key in clip-originals; resolveClipDownloadUrl signs it
    published: false,
    created_at: new Date().toISOString(),
  });

  if (error) {
    await deleteClipPreview(previewPath);
    await deleteClipOriginal(originalPath);
    throw new Error(error.message);
  }

  revalidatePath("/admin/clips");
}

/**
 * Remove the files of a clip upload that was never saved (admin pressed Discard, or the preview step failed).
 * Safety: it only touches the two paths derived from `clipId`, and refuses outright if a clip row with that id
 * exists, so it can never delete a saved clip's original or preview.
 */
export async function discardClipUpload(input: {
  clipId: string;
  originalPath: string;
  previewPath: string;
}) {
  await requireAdmin();
  const { clipId, originalPath, previewPath } = input;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !uuid.test(clipId) ||
    previewPath !== `${clipId}.mp4` ||
    !new RegExp(`^${clipId}\\.(mp4|mov|m4v)$`, "i").test(originalPath)
  ) {
    throw new Error("Unexpected upload paths.");
  }

  const supabase = createServiceClient();
  const { data: existing, error } = await supabase
    .from("clips")
    .select("id")
    .eq("id", clipId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) throw new Error("That clip is already saved, so its files were not removed.");

  await deleteClipPreview(previewPath);
  await deleteClipOriginal(originalPath);
}

/** Bound to a specific clip id + target value via .bind() in the page. */
export async function setClipPublished(clipId: string, published: boolean) {
  await requireAdmin();

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("clips")
    .update({ published })
    .eq("id", clipId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/clips");
  revalidatePath("/games");
  revalidatePath("/");
}

/**
 * Delete a clip. `force` (a hidden field only rendered when the clip has
 * purchases) also erases those purchase rows. Auth is enforced here; the
 * cascade + storage cleanup + block-unless-forced logic lives in
 * `deleteClipCascade`.
 */
export async function deleteClipAction(
  formData: FormData,
): Promise<MutationResult> {
  await requireAdmin();
  const clipId = String(formData.get("clipId") ?? "");
  if (!clipId) return { ok: false, message: "Missing clip id." };

  const result = await deleteClipCascade(clipId, {
    force: formData.get("force") === "1",
  });

  if (result.ok) revalidatePath("/", "layout");
  return result;
}
