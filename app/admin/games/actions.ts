"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteGameCascade, type MutationResult } from "@/lib/admin/mutations";

/**
 * `games.id` and `games.created_at` have no database default (confirmed via
 * information_schema), so both are always supplied explicitly here rather
 * than relying on the database to generate them.
 */
export async function createGame(formData: FormData) {
  await requireAdmin();

  const school_a = String(formData.get("school_a") ?? "").trim();
  const school_b = String(formData.get("school_b") ?? "").trim();
  const game_date = String(formData.get("game_date") ?? "").trim();

  if (!school_a || !school_b || !game_date) {
    throw new Error("school_a, school_b, and game_date are required.");
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("games").insert({
    id: crypto.randomUUID(),
    school_a,
    school_b,
    game_date,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/games");
  revalidatePath("/admin/clips");
  revalidatePath("/");
  revalidatePath("/games");
}

/**
 * Delete a game and all clips under it. `force` (only offered when those clips
 * have purchases) also erases the purchase rows. Cascade + block logic is in
 * `deleteGameCascade`.
 */
export async function deleteGameAction(
  formData: FormData,
): Promise<MutationResult> {
  await requireAdmin();
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { ok: false, message: "Missing game id." };

  const result = await deleteGameCascade(gameId, {
    force: formData.get("force") === "1",
  });

  if (result.ok) revalidatePath("/", "layout");
  return result;
}
