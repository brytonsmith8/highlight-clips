import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { Athlete, Game } from "@/lib/db/types";

/**
 * Admin-only data access, via the service-role client (bypasses grants
 * entirely — sees unpublished clips and `full_url`). Every caller (a Server
 * Component page or Server Action) must call `requireAdmin()` /
 * `requireAdminOrRedirect()` first; these functions do not check auth
 * themselves.
 */

/** Full clip shape as seen by admin — includes full_url and published, which
 * the public-facing `Clip` type (lib/db/types.ts) deliberately omits. */
export interface AdminClip {
  id: string;
  price: number;
  game_id: string;
  athlete_id: string | null;
  preview_url: string | null;
  full_url: string | null;
  published: boolean;
  created_at: string;
}

export async function adminListGames(): Promise<Game[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, school_a, school_b, game_date, created_at")
    .order("game_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Game[];
}

export async function adminListAthletes(): Promise<Athlete[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("athletes")
    .select("id, name, jersey_number, created_at")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Athlete[];
}

export async function adminListClips(): Promise<AdminClip[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clips")
    .select(
      "id, price, game_id, athlete_id, preview_url, full_url, published, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminClip[];
}
