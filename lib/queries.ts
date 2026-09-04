import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Category, Game, PublicClip, Team } from "@/lib/db/types";

/**
 * Read-only data access for the public site.
 *
 * Every query runs through the anon Supabase client and is filtered by
 * Row-Level Security: `games`/`teams`/`categories` are only visible while the
 * game is `active` and inside its publish/expiry window, and clips come from
 * the `public_clips` view (which never exposes `original_path`). Wrapped in
 * React `cache()` so repeated calls in one request hit the database once.
 *
 * On a database error these log and degrade to an empty result rather than
 * taking the whole page down.
 */

export const getActiveGames = cache(async (limit?: number): Promise<Game[]> => {
  const supabase = await createClient();
  let query = supabase
    .from("games")
    .select("*")
    .order("game_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("[queries] getActiveGames:", error.message);
    return [];
  }
  return (data ?? []) as Game[];
});

export const getGameBySlug = cache(
  async (
    slug: string,
  ): Promise<{ game: Game; teams: Team[]; categories: Category[] } | null> => {
    const supabase = await createClient();

    const { data: game, error } = await supabase
      .from("games")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      console.error("[queries] getGameBySlug:", error.message);
      return null;
    }
    if (!game) return null;

    const [teamsRes, categoriesRes] = await Promise.all([
      supabase
        .from("teams")
        .select("*")
        .eq("game_id", (game as Game).id)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("categories")
        .select("*")
        .eq("game_id", (game as Game).id)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    return {
      game: game as Game,
      teams: (teamsRes.data ?? []) as Team[],
      categories: (categoriesRes.data ?? []) as Category[],
    };
  },
);

export const getPublicClips = cache(
  async (
    gameId: string,
    opts: { teamId?: string; categoryId?: string } = {},
  ): Promise<PublicClip[]> => {
    const supabase = await createClient();
    let query = supabase.from("public_clips").select("*").eq("game_id", gameId);
    if (opts.teamId) query = query.eq("team_id", opts.teamId);
    if (opts.categoryId) query = query.eq("category_id", opts.categoryId);

    const { data, error } = await query;
    if (error) {
      console.error("[queries] getPublicClips:", error.message);
      return [];
    }
    return (data ?? []) as PublicClip[];
  },
);
