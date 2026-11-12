"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { isMissingColumnError } from "@/lib/admin/clip-meta";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureSchool, ensureSport, nameKey } from "@/lib/admin/saved-options";

const DB_UPDATE_NEEDED =
  "The database update for sport / school / jersey number / titles has not been run yet. Run the new migration in Supabase first.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateEverywhere() {
  revalidatePath("/admin/clips");
  revalidatePath("/admin/games");
  revalidatePath("/clips");
  revalidatePath("/games");
  revalidatePath("/");
}

/**
 * Change the school, jersey number and (optionally) athlete profile of ONE existing clip.
 * Does not touch files, price or publishing. When the form has an `athleteId` field, an empty value
 * un-assigns the athlete; a value must be the id of an existing athlete profile.
 */
export async function updateClipMeta(formData: FormData) {
  await requireAdmin();
  const clipId = String(formData.get("clipId") ?? "");
  const school = String(formData.get("school") ?? "").trim() || null;
  const jersey = String(formData.get("jersey") ?? "").trim().replace(/^#/, "").slice(0, 8) || null;
  if (!clipId) throw new Error("Missing clip id.");

  const supabase = createServiceClient();

  if (formData.has("athleteId")) {
    const athleteId = String(formData.get("athleteId") ?? "").trim();
    if (athleteId) {
      if (!UUID.test(athleteId)) throw new Error("Invalid athlete.");
      const { data } = await supabase.from("athletes").select("id").eq("id", athleteId).maybeSingle();
      if (!data) throw new Error("That athlete profile was not found.");
    }
    const { error } = await supabase
      .from("clips")
      .update({ athlete_id: athleteId || null })
      .eq("id", clipId);
    if (error) throw new Error(error.message);
  }

  const { error } = await supabase
    .from("clips")
    .update({ school, jersey_number: jersey })
    .eq("id", clipId);
  if (error) throw new Error(isMissingColumnError(error.message) ? DB_UPDATE_NEEDED : error.message);

  revalidateEverywhere();
  revalidatePath(`/games`, "layout");
}

/** Edit a game's schools, date, sport and optional title. Clips, purchases and files are untouched. */
export async function updateGameDetails(formData: FormData) {
  await requireAdmin();
  const gameId = String(formData.get("gameId") ?? "");
  const schoolARaw = String(formData.get("school_a") ?? "").trim();
  const schoolBRaw = String(formData.get("school_b") ?? "").trim();
  const game_date = String(formData.get("game_date") ?? "").trim();
  const sportRaw = String(formData.get("sport") ?? "").trim().slice(0, 60);
  const title = String(formData.get("title") ?? "").trim().slice(0, 160) || null;
  if (!gameId || !schoolARaw || !schoolBRaw || !/^\d{4}-\d{2}-\d{2}$/.test(game_date)) {
    throw new Error("Both teams and a valid date are required.");
  }
  if (nameKey(schoolARaw) === nameKey(schoolBRaw)) throw new Error("The home team and the away team must be different schools.");
  // Re-use the saved spelling of a school/sport (or save it if new) so the lists never get duplicates.
  const school_a = await ensureSchool(schoolARaw);
  const school_b = await ensureSchool(schoolBRaw);
  const sport = sportRaw ? await ensureSport(sportRaw) : null;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("games")
    .update({ school_a, school_b, game_date, sport, title })
    .eq("id", gameId);

  if (error) {
    if (isMissingColumnError(error.message)) {
      // Optional columns not there yet: still save the rest of the edit.
      if (sport || title) throw new Error(DB_UPDATE_NEEDED);
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
