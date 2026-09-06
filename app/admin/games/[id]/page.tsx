import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import {
  adminGetGame,
  adminListAthletes,
  adminListClipsForGame,
} from "@/lib/admin/queries";
import { formatGameDate, formatPrice } from "@/lib/format";
import { setClipPublished } from "@/app/admin/clips/actions";

export const metadata: Metadata = {
  title: "Admin · Game",
  robots: { index: false, follow: false },
};

interface AdminGamePageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminGamePage({ params }: AdminGamePageProps) {
  await requireAdminOrRedirect();
  const { id } = await params;

  const game = await adminGetGame(id);
  if (!game) notFound();

  const [clips, athletes] = await Promise.all([
    adminListClipsForGame(id),
    adminListAthletes(),
  ]);
  const athleteById = new Map(athletes.map((a) => [a.id, a]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/games" className="text-sm text-accent hover:underline">
        &larr; All games
      </Link>

      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        {game.school_a} vs {game.school_b}
      </h1>
      <p className="text-sm text-muted">
        {formatGameDate(game.game_date)} &middot; {game.id}
      </p>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-semibold">Clips</h2>
        <Link href="/admin/clips" className="text-sm text-accent hover:underline">
          Add a clip
        </Link>
      </div>

      <div className="mt-3 space-y-2">
        {clips.length === 0 && (
          <p className="text-muted">No clips for this game yet.</p>
        )}
        {clips.map((clip) => {
          const athlete = clip.athlete_id
            ? athleteById.get(clip.athlete_id)
            : undefined;

          return (
            <div
              key={clip.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {athlete ? athlete.name : "No athlete"}
                  {athlete?.jersey_number ? ` #${athlete.jersey_number}` : ""}
                </p>
                <p className="text-muted">
                  {formatPrice(clip.price)} &middot;{" "}
                  {clip.published ? "Published" : "Unpublished"}
                </p>
              </div>
              <form action={setClipPublished.bind(null, clip.id, !clip.published)}>
                <button
                  type="submit"
                  className={
                    "whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors " +
                    (clip.published
                      ? "border-border hover:border-accent"
                      : "border-accent bg-accent text-white")
                  }
                >
                  {clip.published ? "Unpublish" : "Publish"}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
