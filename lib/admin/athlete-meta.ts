import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/** Optional athlete columns added by migration 0007 (school, sport), read separately so a missing column is harmless. */
export interface AthleteProfileMeta {
  school: string | null;
  sport: string | null;
}

export async function adminAthleteMeta(): Promise<Map<string, AthleteProfileMeta>> {
  const out = new Map<string, AthleteProfileMeta>();
  const { data, error } = await createServiceClient().from("athletes").select("id, school, sport");
  if (error || !data) return out;
  for (const r of data as { id: string; school: string | null; sport: string | null }[]) {
    out.set(r.id, { school: r.school?.trim() || null, sport: r.sport?.trim() || null });
  }
  return out;
}

/** Clip id -> athlete id for the given clips (athlete_id is an existing column). */
export async function adminClipAthleteIds(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const { data } = await createServiceClient().from("clips").select("id, athlete_id").in("id", ids);
  for (const r of (data ?? []) as { id: string; athlete_id: string | null }[]) out.set(r.id, r.athlete_id);
  return out;
}
