"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { isMissingColumnError } from "@/lib/admin/clip-meta";
import { createServiceClient } from "@/lib/supabase/service";

const DB_UPDATE_NEEDED =
  "The database update for sport / school / jersey number has not been run yet. Run migration 0006 in Supabase first.";

function revalidateEverywhere() {
  revalidatePath("/admin/clips");
  revalidatePath("/admin/games");
  revalidatePath("/clips");
  revalidatePath("/games");
  revalidatePath("/");
}

/** Change the school and jersey number of ONE existing clip. Does not touch files, price or publishing. */
export async function updateClipMeta(formData: FormData) {
  await requireAdmin();
  const clipId = String(formData.get("clipId") ?? "");
  const school = String(formData.get("school") ?? "").trim() || null;
  const jersey = String(formData.get("jersey") ?? "").trim().replace(/^#/, "").slice(0, 8) || null;
  if (!clipId) throw new Error("Missing clip id.");

  const { error } = await createServiceClient()
    .from("clips")
    .update({ school, jersey_number: jersey })
    .eq("id", clipId);
  if (error) throw new Error(isMissingColumnError(error.message) ? DB_UPDATE_NEEDED : error.message);

  revalidateEverywhere();
  revalidatePath(`/games`, "layout");
}

/** Edit a game's schools, date and sport. Clips, purchases and files are untouched. */
export async function updateGameDetails(formData: FormData) {
  await requireAdmin();
  const gameId = String(formData.get("gameId") ?? "");
  const school_a = String(formData.get("school_a") ?? "").trim();
  const school_b = String(formData.get("school_b") ?? "").trim();
  const game_date = String(formData.get("game_date") ?? "").trim();
  const sport = String(formData.get("sport") ?? "").trim().slice(0, 60) || null;
  if (!gameId || !school_a || !school_b || !/^\d{4}-\d{2}-\d{2}$/.test(game_date)) {
    throw new Error("Both teams and a valid date are required.");
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("games")
    .update({ school_a, school_b, game_date, sport })
    .eq("id", gameId);

  if (error) {
    if (isMissingColumnError(error.message)) {
      // Sport column not there yet: still save the rest of the edit.
      if (sport) throw new Error(DB_UPDATE_NEEDED);
      const retry = await supabase.from("games").update({ school_a, school_b, game_date }).eq("id", gameId);
      if (retry.error) throw new Error(retry.error.message);
    } else {
      throw new Error(error.message);
    }
  }

  revalidateEverywhere();
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
}
