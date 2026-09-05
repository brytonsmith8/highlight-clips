import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import {
  adminListAthletes,
  adminListClips,
  adminListGames,
} from "@/lib/admin/queries";
import { formatPrice } from "@/lib/format";
import { NewClipForm } from "@/components/admin/new-clip-form";
import { setClipPublished } from "./actions";

export const metadata: Metadata = {
  title: "Admin · Clips",
  robots: { index: false, follow: false },
};

export default async function AdminClipsPage() {
  await requireAdminOrRedirect();

  const [clips, games, athletes] = await Promise.all([
    adminListClips(),
    adminListGames(),
    adminListAthletes(),
  ]);
  const gameById = new Map(games.map((g) => [g.id, g]));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Clips</h1>

      <NewClipForm
        games={games.map((game) => ({
          id: game.id,
          label: `${game.school_a} vs ${game.school_b}`,
        }))}
        athletes={athletes.map((athlete) => ({
          id: athlete.id,
          label: athlete.jersey_number
            ? `${athlete.name} #${athlete.jersey_number}`
            : athlete.name,
        }))}
      />

      <div className="mt-6 space-y-2">
        {clips.length === 0 && <p className="text-muted">No clips yet.</p>}
        {clips.map((clip) => {
          const game = gameById.get(clip.game_id);
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
                  {game ? `${game.school_a} vs ${game.school_b}` : "Unknown game"}
                  {athlete ? ` · ${athlete.name}` : ""}
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
