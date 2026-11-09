import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Optional extra details that live in columns added by migration 0006
 * (games.sport, clips.school, clips.jersey_number). They are read in their OWN
 * queries so that, until the migration has been run, a missing column simply
 * yields "no extra details" and every existing page keeps working unchanged.
 */

export interface ClipMeta {
  school: string | null;
  jersey: string | null;
}

export const getGameSports = cache(async (): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("games").select("id, sport");
    if (error || !data) return out;
    for (const row of data as { id: string; sport: string | null }[]) {
      if (row.sport && row.sport.trim()) out.set(row.id, row.sport.trim());
    }
  } catch {
    /* column not there yet: no sports */
  }
  return out;
});

export const getClipMeta = cache(async (): Promise<Map<string, ClipMeta>> => {
  const out = new Map<string, ClipMeta>();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clips")
      .select("id, school, jersey_number")
      .eq("published", true);
    if (error || !data) return out;
    for (const row of data as { id: string; school: string | null; jersey_number: string | null }[]) {
      out.set(row.id, {
        school: row.school?.trim() || null,
        jersey: row.jersey_number?.trim().replace(/^#/, "") || null,
      });
    }
  } catch {
    /* column not there yet: no extra details */
  }
  return out;
});
