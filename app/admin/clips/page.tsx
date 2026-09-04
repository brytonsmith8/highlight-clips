import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import {
  adminListAthletes,
  adminListClips,
  adminListGames,
} from "@/lib/admin/queries";
import { formatPrice } from "@/lib/format";
import { createClip, setClipPublished } from "./actions";

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

      <form
        action={createClip}
        className="mt-6 space-y-3 rounded-lg border border-border p-4"
      >
        <h2 className="font-semibold">New clip</h2>
        <select
          name="game_id"
          required
          defaultValue=""
          className="w-full rounded border border-border px-3 py-2"
        >
          <option value="" disabled>
            Select game…
          </option>
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.school_a} vs {game.school_b}
            </option>
          ))}
        </select>
        <select
          name="athlete_id"
          defaultValue=""
          className="w-full rounded border border-border px-3 py-2"
        >
          <option value="">No athlete</option>
          {athletes.map((athlete) => (
            <option key={athlete.id} value={athlete.id}>
              {athlete.name}
              {athlete.jersey_number ? ` #${athlete.jersey_number}` : ""}
            </option>
          ))}
        </select>
        <input
          name="price"
          type="number"
          min="0"
          step="0.01"
          placeholder="Price (USD)"
          required
          className="w-full rounded border border-border px-3 py-2"
        />
        <input
          name="preview_url"
          type="url"
          placeholder="Preview URL (public, watermarked)"
          required
          className="w-full rounded border border-border px-3 py-2"
        />
        <input
          name="full_url"
          type="url"
          placeholder="Full/original URL (never shown publicly)"
          required
          className="w-full rounded border border-border px-3 py-2"
        />
        <button
          type="submit"
          className="rounded bg-accent px-3 py-2 font-medium text-white"
        >
          Create clip (unpublished)
        </button>
      </form>

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
