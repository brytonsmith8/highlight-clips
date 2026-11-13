"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { isMissingColumnError } from "@/lib/admin/clip-meta";
import { createServiceClient } from "@/lib/supabase/service";
import {
  unlabelAndDeleteAthlete,
  type MutationResult,
} from "@/lib/admin/mutations";

const DB_UPDATE_NEEDED =
  "The database update for athlete profiles (migration 0007) has not been run yet. Run it in Supabase first.";

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function clean(formData: FormData, key: string, max = 120): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function revalidateAthletes() {
  revalidatePath("/admin");
  revalidatePath("/admin/athletes");
  revalidatePath("/admin/clips");
  revalidatePath("/clips");
  revalidatePath("/games", "layout");
}

/**
 * Create an athlete PROFILE: one athlete at one school. The profile id is the athlete's identity (a jersey
 * number alone never is). Name is optional. If an identical profile already exists (same school, jersey and
 * name) it is reused instead of creating a duplicate.
 */
export async function createAthleteProfile(input: {
  school: string;
  jersey?: string;
  name?: string;
  sport?: string;
}): Promise<{ id: string; reused: boolean }> {
  await requireAdmin();
  const school = (input.school ?? "").trim().slice(0, 120);
  const jersey = (input.jersey ?? "").trim().replace(/^#/, "").slice(0, 8);
  const name = (input.name ?? "").trim().slice(0, 120);
  const sport = (input.sport ?? "").trim().slice(0, 60);
  if (!school) throw new Error("A school is required for an athlete profile.");

  const supabase = createServiceClient();
  const existing = await supabase.from("athletes").select("id, name, jersey_number, school");
  if (existing.error) {
    throw new Error(isMissingColumnError(existing.error.message) ? DB_UPDATE_NEEDED : existing.error.message);
  }
  const match = (existing.data ?? []).find(
    (a: { name: string | null; jersey_number: string | null; school: string | null }) =>
      norm(a.school) === norm(school) && norm(a.jersey_number) === norm(jersey) && norm(a.name) === norm(name),
  ) as { id: string } | undefined;
  if (match) return { id: match.id, reused: true };

  const id = crypto.randomUUID();
  const { error } = await supabase.from("athletes").insert({
    id,
    name, // optional: stored as "" when unknown (the column cannot be null)
    jersey_number: jersey || null,
    school,
    sport: sport || null,
    created_at: new Date().toISOString(),
  } as Record<string, unknown>);
  if (error) throw new Error(isMissingColumnError(error.message) ? DB_UPDATE_NEEDED : error.message);

  revalidateAthletes();
  return { id, reused: false };
}

export async function createAthlete(formData: FormData) {
  await requireAdmin();
  await createAthleteProfile({
    school: clean(formData, "school"),
    jersey: clean(formData, "jersey_number", 8),
    name: clean(formData, "name"),
    sport: clean(formData, "sport", 60),
  });
}

/** Correct an athlete profile: name, jersey number, school or sport. Clip assignments stay attached to the profile. */
export async function updateAthlete(formData: FormData) {
  await requireAdmin();
  const athleteId = clean(formData, "athleteId", 64);
  const school = clean(formData, "school");
  if (!athleteId) throw new Error("Missing athlete id.");
  if (!school) throw new Error("A school is required.");

  const { error } = await createServiceClient()
    .from("athletes")
    .update({
      name: clean(formData, "name"),
      jersey_number: clean(formData, "jersey_number", 8).replace(/^#/, "") || null,
      school,
      sport: clean(formData, "sport", 60) || null,
    } as Record<string, unknown>)
    .eq("id", athleteId);
  if (error) throw new Error(isMissingColumnError(error.message) ? DB_UPDATE_NEEDED : error.message);

  revalidateAthletes();
}

/**
 * Delete an athlete. Clips that referenced it are kept and unlabeled — see
 * `unlabelAndDeleteAthlete`. Never blocked.
 */
export async function deleteAthleteAction(
  formData: FormData,
): Promise<MutationResult> {
  await requireAdmin();
  const athleteId = String(formData.get("athleteId") ?? "");
  if (!athleteId) return { ok: false, message: "Missing athlete id." };

  const result = await unlabelAndDeleteAthlete(athleteId);

  if (result.ok) revalidatePath("/", "layout");
  return result;
}
