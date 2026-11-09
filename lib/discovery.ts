import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Athlete, Clip, Game } from "@/lib/db/types";
import { getClipMeta, getGameSports } from "@/lib/clip-meta";
import { getGames, type ClipWithAthlete } from "@/lib/queries";
import { normalizeJersey, type DiscoveryItem } from "@/lib/discovery-filter";

export interface DiscoveryClip {
  clip: ClipWithAthlete;
  game: Game;
  school: string | null;
  sport: string | null;
  jersey: string | null;
  item: DiscoveryItem;
}

/** Every published clip on the site, with its game, sport, school and jersey number. Read-only. */
export const getDiscoveryCatalog = cache(async (): Promise<DiscoveryClip[]> => {
  const supabase = await createClient();
  const [games, sports, meta] = await Promise.all([getGames(), getGameSports(), getClipMeta()]);
  const gameById = new Map(games.map((g) => [g.id, g]));

  const { data: clipRows, error } = await supabase
    .from("clips")
    .select("id, price, game_id, athlete_id, preview_url, published, created_at")
    .eq("published", true)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[discovery] clips:", error.message);
    return [];
  }

  const athletesById = new Map<string, Athlete>();
  const { data: athleteRows } = await supabase
    .from("athletes")
    .select("id, name, jersey_number, created_at");
  for (const a of (athleteRows ?? []) as Athlete[]) athletesById.set(a.id, a);

  const out: DiscoveryClip[] = [];
  for (const row of (clipRows ?? []) as Clip[]) {
    const game = gameById.get(row.game_id);
    if (!game) continue;
    const athlete = row.athlete_id ? (athletesById.get(row.athlete_id) ?? null) : null;
    const m = meta.get(row.id);
    const jersey = normalizeJersey(m?.jersey ?? athlete?.jersey_number ?? null);
    const school = m?.school ?? null;
    const sport = sports.get(game.id) ?? null;
    out.push({
      clip: { ...row, athlete },
      game,
      school,
      sport,
      jersey,
      item: {
        clipId: row.id,
        gameId: game.id,
        schoolA: game.school_a,
        schoolB: game.school_b,
        school,
        sport,
        date: game.game_date,
        jersey,
      },
    });
  }
  return out;
});
