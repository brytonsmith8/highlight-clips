import Link from "next/link";

import type { Game } from "@/lib/db/types";
import { formatGameDate } from "@/lib/format";
import { ExpiryBadge } from "@/components/expiry-badge";

export function GameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className="block rounded-lg border border-border p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-tight">{game.title}</h3>
        <ExpiryBadge expiresAt={game.expires_at} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {game.sport} &middot; {formatGameDate(game.game_date)}
      </p>
    </Link>
  );
}
