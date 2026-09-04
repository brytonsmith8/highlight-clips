import type { Metadata } from "next";

import { getActiveGames } from "@/lib/queries";
import { GameCard } from "@/components/game-card";

export const metadata: Metadata = {
  title: "Games",
  description: "Sports games with highlight clips currently available to buy.",
};

export default async function GamesPage() {
  const games = await getActiveGames();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Available games</h1>
      <p className="mt-1 text-sm text-muted">
        Highlights are available for a limited time after each game.
      </p>

      {games.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border p-6 text-center text-muted">
          <p>No games are available right now.</p>
          <p className="mt-1 text-sm">
            Check back after the next event.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
