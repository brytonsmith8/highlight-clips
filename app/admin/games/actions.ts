"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteGameCascade, type MutationResult } from "@/lib/admin/mutations";
import { isMissingColumnError } from "@/lib/admin/clip-meta";

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
  const sport = String(formData.get("sport") ?? "").trim().slice(0, 60) || null;
  const title = String(formData.get("title") ?? "").trim().slice(0, 160) || null;

  if (!school_a || !school_b || !game_date) {
    throw new Error("school_a, school_b, and game_date are required.");
  }

  const supabase = createServiceClient();
  const baseRow = {
    id: crypto.randomUUID(),
    school_a,
    school_b,
    game_date,
    created_at: new Date().toISOString(),
  };
  let { error } = await supabase.from("games").insert(({ ...baseRow, ...(sport ? { sport } : {}), ...(title ? { title } : {}) }) as Record<string, unknown>);
  if (error && (sport || title) && isMissingColumnError(error.message)) {
    // Optional columns not added yet: save the game without the sport / title.
    ({ error } = await supabase.from("games").insert(baseRow));
  }
  if (error) throw new Error(error.message);

  revalidatePath("/admin/games");
  revalidatePath("/admin/clips");
  revalidatePath("/");
  revalidatePath("/games");
  revalidatePath("/clips");
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
