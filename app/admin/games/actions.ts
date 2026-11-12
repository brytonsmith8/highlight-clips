"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteGameCascade, type MutationResult } from "@/lib/admin/mutations";
import { isMissingColumnError } from "@/lib/admin/clip-meta";
import { NEW_OPTION } from "@/lib/admin/form-constants";
import { cleanName, ensureSchool, ensureSport, nameKey } from "@/lib/admin/saved-options";

export interface CreateGameResult {
  ok: boolean;
  message: string;
  gameId?: string;
}

function pick(formData: FormData, field: string, max: number): string {
  const chosen = String(formData.get(field) ?? "");
  const value = chosen === NEW_OPTION ? String(formData.get(`${field}_new`) ?? "") : chosen;
  return cleanName(value, max);
}

/**
 * `games.id` and `games.created_at` have no database default (confirmed via
 * information_schema), so both are always supplied explicitly here rather
 * than relying on the database to generate them.
 *
 * Schools and the sport come from the saved dropdowns (or "add new", which saves them for next time).
 * Every call creates its OWN game record: two games between the same schools on different dates (or with a
 * different title) stay separate. Only an exact repeat (same teams, date, sport and title) is refused.
 */
export async function createGame(formData: FormData): Promise<CreateGameResult> {
  await requireAdmin();

  const schoolARaw = pick(formData, "school_a", 120);
  const schoolBRaw = pick(formData, "school_b", 120);
  const game_date = String(formData.get("game_date") ?? "").trim();
  const sportRaw = pick(formData, "sport", 60);
  const title = String(formData.get("title") ?? "").trim().slice(0, 160) || null;

  if (!schoolARaw || !schoolBRaw) return { ok: false, message: "Choose the home team and the away team." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(game_date) || Number.isNaN(Date.parse(`${game_date}T12:00:00Z`))) {
    return { ok: false, message: "Choose the game date." };
  }
  if (nameKey(schoolARaw) === nameKey(schoolBRaw)) {
    return { ok: false, message: "The home team and the away team must be different schools." };
  }

  const school_a = await ensureSchool(schoolARaw);
  const school_b = await ensureSchool(schoolBRaw);
  const sport = sportRaw ? await ensureSport(sportRaw) : null;

  const supabase = createServiceClient();

  // Refuse only an exact repeat, so a double-click or a re-entry cannot create the same game twice.
  const same = await supabase.from("games").select("id, school_a, school_b, game_date, sport, title").eq("game_date", game_date);
  if (!same.error) {
    const repeat = ((same.data ?? []) as { id: string; school_a: string; school_b: string; sport?: string | null; title?: string | null }[]).find(
      (g) =>
        nameKey(g.school_a) === nameKey(school_a) &&
        nameKey(g.school_b) === nameKey(school_b) &&
        nameKey(g.sport) === nameKey(sport) &&
        nameKey(g.title) === nameKey(title),
    );
    if (repeat) {
      return {
        ok: false,
        gameId: repeat.id,
        message: "That exact game already exists (same teams, date, sport and title). Open it from the list below to add clips.",
      };
    }
  }

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
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/games");
  revalidatePath("/admin/clips");
  revalidatePath("/");
  revalidatePath("/games");
  revalidatePath("/clips");
  return { ok: true, gameId: baseRow.id, message: `Game saved: ${school_a} vs ${school_b}.` };
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

  const result = await deleteGameCascade(gameId);

  if (result.ok) revalidatePath("/", "layout");
  return result;
}
