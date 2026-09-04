import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Athlete, Clip, Game } from "@/lib/db/types";

/**
 * Read-only data access for the public site, against the production
 * `games` / `athletes` / `clips` tables. Runs through the anon Supabase
 * client; `clips` is queried with only the columns anon/authenticated were
 * granted (never `full_url`). `purchases` is never queried here.
 *
 * There is no foreign-key relationship registered between `clips.athlete_id`
 * and `athletes.id` in this schema (confirmed via PostgREST — embedding
 * fails with PGRST200), so athlete lookups are done as a second query and
 * joined in application code rather than via a PostgREST embed.
 *
 * Wrapped in React `cache()` for per-request dedupe. On a database error,
 * these log and degrade to an empty result rather than crashing the page.
 */

export const getGames = cache(async (limit?: number): Promise<Game[]> => {
  const supabase = await createClient();
  let query = supabase
    .from("games")
    .select("id, school_a, school_b, game_date, created_at")
    .order("game_date", { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("[queries] getGames:", error.message);
    return [];
  }
  return (data ?? []) as Game[];
});

export const getGameById = cache(async (id: string): Promise<Game | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, school_a, school_b, game_date, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[queries] getGameById:", error.message);
    return null;
  }
  return (data as Game | null) ?? null;
});

export type ClipWithAthlete = Clip & { athlete: Athlete | null };

export const getClipsForGame = cache(
  async (
    gameId: string,
    opts: { athleteId?: string } = {},
  ): Promise<ClipWithAthlete[]> => {
    const supabase = await createClient();

    let query = supabase
      .from("clips")
      .select("id, price, game_id, athlete_id, preview_url, published, created_at")
      .eq("game_id", gameId)
      .eq("published", true);
    if (opts.athleteId) query = query.eq("athlete_id", opts.athleteId);

    const { data: clips, error } = await query;
    if (error) {
      console.error("[queries] getClipsForGame:", error.message);
      return [];
    }

    const athleteIds = Array.from(
      new Set((clips ?? []).map((c) => c.athlete_id).filter((v): v is string => Boolean(v))),
    );

    const athletesById = new Map<string, Athlete>();
    if (athleteIds.length > 0) {
      const { data: athletes, error: athleteError } = await supabase
        .from("athletes")
        .select("id, name, jersey_number, created_at")
        .in("id", athleteIds);
      if (athleteError) {
        console.error("[queries] getClipsForGame (athletes):", athleteError.message);
      } else {
        for (const a of (athletes ?? []) as Athlete[]) athletesById.set(a.id, a);
      }
    }

    return ((clips ?? []) as Clip[]).map((clip) => ({
      ...clip,
      athlete: clip.athlete_id ? (athletesById.get(clip.athlete_id) ?? null) : null,
    }));
  },
);

/** Distinct athletes who have at least one *published* clip in this game — used for the filter pills. */
export const getAthletesForGame = cache(async (gameId: string): Promise<Athlete[]> => {
  const supabase = await createClient();

  const { data: clips, error: clipsError } = await supabase
    .from("clips")
    .select("athlete_id")
    .eq("game_id", gameId)
    .eq("published", true);
  if (clipsError || !clips) {
    if (clipsError) console.error("[queries] getAthletesForGame (clips):", clipsError.message);
    return [];
  }

  const athleteIds = Array.from(
    new Set(clips.map((c) => c.athlete_id).filter((v): v is string => Boolean(v))),
  );
  if (athleteIds.length === 0) return [];

  const { data, error } = await supabase
    .from("athletes")
    .select("id, name, jersey_number, created_at")
    .in("id", athleteIds)
    .order("name", { ascending: true });

  if (error) {
    console.error("[queries] getAthletesForGame:", error.message);
    return [];
  }
  return (data ?? []) as Athlete[];
});
