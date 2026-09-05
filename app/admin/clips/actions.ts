"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  deleteClipOriginal,
  deleteClipPreview,
  uploadClipOriginal,
  uploadClipPreview,
} from "@/lib/storage";

export async function createClip(formData: FormData) {
  await requireAdmin();

  const game_id = String(formData.get("game_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const previewFile = formData.get("preview_file");
  const originalFile = formData.get("original_file");

  if (!game_id || !priceRaw) {
    throw new Error("game_id and price are required.");
  }
  if (!(previewFile instanceof File) || previewFile.size === 0) {
    throw new Error("A preview video file is required.");
  }
  if (!(originalFile instanceof File) || originalFile.size === 0) {
    throw new Error("An original video file is required.");
  }
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("price must be a non-negative number.");
  }

  // Upload both files first, then insert the row.
  const clipId = crypto.randomUUID();
  const previewUrl = await uploadClipPreview(clipId, previewFile);
  const originalKey = await uploadClipOriginal(clipId, originalFile);

  const supabase = createServiceClient();
  const { error } = await supabase.from("clips").insert({
    id: clipId,
    game_id,
    athlete_id: athleteId || null,
    price,
    preview_url: previewUrl,
    full_url: originalKey,
    published: false,
    created_at: new Date().toISOString(),
  });
  if (error) {
    // roll back both orphaned uploads
    await deleteClipPreview(`${clipId}.${previewFile.name.split(".").pop() || "mp4"}`);
    await deleteClipOriginal(originalKey);
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
