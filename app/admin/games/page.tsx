import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { adminListGames } from "@/lib/admin/queries";
import { adminGameSports } from "@/lib/admin/clip-meta";
import { listSavedOptions } from "@/lib/admin/saved-options";
import { formatGameDate } from "@/lib/format";
import { NewGameForm } from "@/components/admin/new-game-form";

export const metadata: Metadata = {
  title: "Admin · Games",
  robots: { index: false, follow: false },
};

interface AdminGamesPageProps {
  searchParams: Promise<{ home?: string; away?: string; sport?: string }>;
}

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AdminGamesPage({ searchParams }: AdminGamesPageProps) {
  await requireAdminOrRedirect();
  const params = await searchParams;
  const [games, sports, saved] = await Promise.all([adminListGames(), adminGameSports(), listSavedOptions()]);
  const defaults = { home: one(params.home), away: one(params.away), sport: one(params.sport) };
  const formKey = `${defaults.home}|${defaults.away}|${defaults.sport}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Games</h1>

      <NewGameForm
        key={formKey}
        schools={saved.schools}
        sports={saved.sports}
        defaults={defaults}
        tablesReady={saved.tablesReady}
      />

      <h2 className="mt-8 font-semibold">Game history</h2>
      <p className="text-sm text-muted">
        Every game is its own record. Use &ldquo;Same matchup&rdquo; to start a new game with the same teams and sport,
        then pick the new date.
      </p>
      <div className="mt-3 space-y-2">
        {games.length === 0 && <p className="text-muted">No games yet.</p>}
        {games.map((game) => {
          const sport = sports.get(game.id) ?? "";
          const again = new URLSearchParams({ home: game.school_a, away: game.school_b, ...(sport ? { sport } : {}) });
          return (
            <div
              key={game.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 transition-colors hover:border-accent"
            >
              <Link href={`/admin/games/${game.id}`} className="min-w-0 flex-1">
                <p className="font-medium">
                  {game.school_a} vs {game.school_b}
                </p>
                <p className="text-sm text-muted [overflow-wrap:anywhere]">
                  {formatGameDate(game.game_date)}
                  {sport ? ` · ${sport}` : ""} &middot; {game.id}
                </p>
              </Link>
              <Link
                href={`/admin/games?${again.toString()}`}
                className="whitespace-nowrap rounded border border-border px-2 py-1 text-xs hover:border-accent"
              >
                Same matchup
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
