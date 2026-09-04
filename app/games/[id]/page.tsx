import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getAthletesForGame, getClipsForGame, getGameById } from "@/lib/queries";
import { formatGameDate } from "@/lib/format";
import { ClipCard } from "@/components/clip-card";

interface GamePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ athlete?: string }>;
}

function pillClass(active: boolean): string {
  return (
    "inline-block rounded-full border px-3 py-1 text-sm transition-colors " +
    (active
      ? "border-accent bg-accent text-white"
      : "border-border text-foreground hover:border-accent")
  );
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { id } = await params;
  const game = await getGameById(id);
  if (!game) return { title: "Game not found" };
  return { title: `${game.school_a} vs ${game.school_b}` };
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  const { id } = await params;
  const { athlete } = await searchParams;

  const game = await getGameById(id);
  if (!game) notFound();

  const [athletes, clips] = await Promise.all([
    getAthletesForGame(game.id),
    getClipsForGame(game.id, { athleteId: athlete }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">
        {game.school_a} vs {game.school_b}
      </h1>
      <p className="mt-1 text-sm text-muted">{formatGameDate(game.game_date)}</p>

      {athletes.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/games/${game.id}`} className={pillClass(!athlete)}>
            All
          </Link>
          {athletes.map((a) => (
            <Link
              key={a.id}
              href={`/games/${game.id}?athlete=${a.id}`}
              className={pillClass(athlete === a.id)}
            >
              {a.name}
              {a.jersey_number ? ` #${a.jersey_number}` : ""}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6">
        {clips.length === 0 ? (
          <p className="rounded-lg border border-border p-6 text-center text-muted">
            No clips here yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
