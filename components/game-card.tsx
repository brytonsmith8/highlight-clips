import Link from "next/link";

import type { Game } from "@/lib/db/types";
import { formatGameDate } from "@/lib/format";

export function GameCard({
  game,
  tone = "light",
}: {
  game: Game;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <Link
      href={`/games/${game.id}`}
      className={
        dark
          ? "group block rounded-lg border border-white/15 bg-white/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-600 hover:bg-white/10"
          : "block rounded-lg border border-border p-4 transition-colors hover:border-accent"
      }
    >
      <h3 className="font-semibold leading-tight">
        {game.school_a} vs {game.school_b}
      </h3>
      <p className={`mt-1 text-sm ${dark ? "text-white/65" : "text-muted"}`}>
        {formatGameDate(game.game_date)}
      </p>
      {dark && (
        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-red-500 transition-transform duration-200 group-hover:translate-x-1">
          View clips &rarr;
        </p>
      )}
    </Link>
  );
}
