import Link from "next/link";

import type { Game } from "@/lib/db/types";
import { formatGameDate } from "@/lib/format";

export function GameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/games/${game.id}`}
      className="block rounded-lg border border-border p-4 transition-colors hover:border-accent"
    >
      <h3 className="font-semibold leading-tight">
        {game.school_a} vs {game.school_b}
      </h3>
      <p className="mt-1 text-sm text-muted">{formatGameDate(game.game_date)}</p>
    </Link>
  );
}
