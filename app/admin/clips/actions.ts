"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteClipOriginal, uploadClipOriginal } from "@/lib/storage";

export async function createClip(formData: FormData) {
  await requireAdmin();

  const game_id = String(formData.get("game_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const preview_url = String(formData.get("preview_url") ?? "").trim();
  const originalFile = formData.get("original_file");

  if (!game_id || !priceRaw || !preview_url) {
    throw new Error("game_id, price, and preview_url are required.");
  }
  if (!(originalFile instanceof File) || originalFile.size === 0) {
    throw new Error("An original video file is required.");
  }
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("price must be a non-negative number.");
  }

  // Upload the original to the private bucket first; store its object key in full_url.
  const clipId = crypto.randomUUID();
  const objectKey = await uploadClipOriginal(clipId, originalFile);

  const supabase = createServiceClient();
  const { error } = await supabase.from("clips").insert({
    id: clipId,
    game_id,
    athlete_id: athleteId || null,
    price,
    preview_url,
    full_url: objectKey,
    published: false,
    created_at: new Date().toISOString(),
  });
  if (error) {
    await deleteClipOriginal(objectKey); // roll back the orphaned upload
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
