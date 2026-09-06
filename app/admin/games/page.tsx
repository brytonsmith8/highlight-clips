import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { adminListGames } from "@/lib/admin/queries";
import { formatGameDate } from "@/lib/format";
import { createGame } from "./actions";

export const metadata: Metadata = {
  title: "Admin · Games",
  robots: { index: false, follow: false },
};

export default async function AdminGamesPage() {
  await requireAdminOrRedirect();
  const games = await adminListGames();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Games</h1>

      <form
        action={createGame}
        className="mt-6 space-y-3 rounded-lg border border-border p-4"
      >
        <h2 className="font-semibold">New game</h2>
        <input
          name="school_a"
          placeholder="School A"
          required
          className="w-full rounded border border-border px-3 py-2"
        />
        <input
          name="school_b"
          placeholder="School B"
          required
          className="w-full rounded border border-border px-3 py-2"
        />
        <input
          name="game_date"
          type="date"
          required
          className="w-full rounded border border-border px-3 py-2"
        />
        <button
          type="submit"
          className="rounded bg-accent px-3 py-2 font-medium text-white"
        >
          Create game
        </button>
      </form>

      <div className="mt-6 space-y-2">
        {games.length === 0 && <p className="text-muted">No games yet.</p>}
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/admin/games/${game.id}`}
            className="block rounded-lg border border-border p-3 transition-colors hover:border-accent"
          >
            <p className="font-medium">
              {game.school_a} vs {game.school_b}
            </p>
            <p className="text-sm text-muted">
              {formatGameDate(game.game_date)} &middot; {game.id}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
