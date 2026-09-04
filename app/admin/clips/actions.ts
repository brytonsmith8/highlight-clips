"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function createClip(formData: FormData) {
  await requireAdmin();

  const game_id = String(formData.get("game_id") ?? "").trim();
  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const preview_url = String(formData.get("preview_url") ?? "").trim();
  const full_url = String(formData.get("full_url") ?? "").trim();

  if (!game_id || !priceRaw || !preview_url || !full_url) {
    throw new Error(
      "game_id, price, preview_url, and full_url are required.",
    );
  }
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("price must be a non-negative number.");
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("clips").insert({
    id: crypto.randomUUID(),
    game_id,
    athlete_id: athleteId || null,
    price,
    preview_url,
    full_url,
    published: false,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

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
