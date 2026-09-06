"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteClipCascade, type MutationResult } from "@/lib/admin/mutations";
import {
  CLIP_ORIGINALS_BUCKET,
  CLIP_PREVIEWS_BUCKET,
  clipObjectExists,
  clipPreviewPublicUrl,
  createClipUploadUrls,
  deleteClipOriginal,
  deleteClipPreview,
  type ClipUploadUrls,
} from "@/lib/storage";

/**
 * Step 1 of the direct-to-storage upload: hand the browser one-time signed
 * upload URLs. Returns only small strings — no file data passes through here.
 */
export async function startClipUpload(input: {
  previewExt: string;
  originalExt: string;
}): Promise<ClipUploadUrls> {
  await requireAdmin();
  const clipId = crypto.randomUUID();
  return createClipUploadUrls(clipId, input.previewExt, input.originalExt);
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

  const [previewOk, originalOk] = await Promise.all([
    clipObjectExists(CLIP_PREVIEWS_BUCKET, previewPath),
    clipObjectExists(CLIP_ORIGINALS_BUCKET, originalPath),
  ]);
  if (!previewOk || !originalOk) {
    throw new Error("Upload did not complete — please try again.");
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
