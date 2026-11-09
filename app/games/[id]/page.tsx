import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getAthletesForGame, getClipsForGame, getGameById } from "@/lib/queries";
import { getClipMeta, getGameSports } from "@/lib/clip-meta";
import { normalizeJersey } from "@/lib/discovery-filter";
import { formatGameDate } from "@/lib/format";
import { ClipCard } from "@/components/clip-card";
import { CartSummary, SelectableClip, SelectionProvider } from "@/components/clip-selection";

interface GamePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ athlete?: string; jersey?: string }>;
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
  const { athlete, jersey: jerseyParam } = await searchParams;
  const jersey = normalizeJersey(jerseyParam);

  const game = await getGameById(id);
  if (!game) notFound();

  const [athletes, byAthlete, allGameClips, meta, sports] = await Promise.all([
    getAthletesForGame(game.id),
    getClipsForGame(game.id, { athleteId: athlete }),
    getClipsForGame(game.id),
    getClipMeta(),
    getGameSports(),
  ]);
  const jerseyOf = (c: (typeof byAthlete)[number]) =>
    normalizeJersey(meta.get(c.id)?.jersey ?? c.athlete?.jersey_number ?? null);
  const clips = jersey ? byAthlete.filter((c) => jerseyOf(c) === jersey) : byAthlete;
  const jerseys = Array.from(
    new Set(allGameClips.map(jerseyOf).filter((j): j is string => Boolean(j))),
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const sport = sports.get(game.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">
        {game.school_a} vs {game.school_b}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {formatGameDate(game.game_date)}
        {sport ? ` · ${sport}` : ""}
      </p>
      <Link href="/clips" className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
        &larr; Find your clips
      </Link>

      {jerseys.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Jersey number</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={`/games/${game.id}`} className={pillClass(!jersey)}>
              All
            </Link>
            {jerseys.map((j) => (
              <Link key={j} href={`/games/${game.id}?jersey=${encodeURIComponent(j)}`} className={pillClass(jersey === j)}>
                #{j}
              </Link>
            ))}
          </div>
        </div>
      )}

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
          <SelectionProvider gameId={game.id}>
            <div className="grid gap-4 sm:grid-cols-2">
              {clips.map((clip) => (
                <SelectableClip key={clip.id} clipId={clip.id}>
                  <ClipCard clip={clip} jersey={meta.get(clip.id)?.jersey} school={meta.get(clip.id)?.school} />
                </SelectableClip>
              ))}
            </div>
            <CartSummary />
          </SelectionProvider>
        )}
      </div>
    </div>
  );
}
