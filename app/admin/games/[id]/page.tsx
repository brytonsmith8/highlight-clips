import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import {
  adminGetGame,
  adminListAthletes,
  adminListClipsForGame,
  adminPurchaseCountsByClip,
} from "@/lib/admin/queries";
import { formatGameDate, formatPrice } from "@/lib/format";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { deleteClipAction, setClipPublished } from "@/app/admin/clips/actions";
import { deleteGameAction } from "@/app/admin/games/actions";
import { adminClipMetaByIds, adminGameSports, adminGameTitle } from "@/lib/admin/clip-meta";
import { adminAthleteMeta } from "@/lib/admin/athlete-meta";
import { updateClipMeta, updateGameDetails } from "@/app/admin/clips/meta-actions";

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
  const purchaseCounts = await adminPurchaseCountsByClip(clips.map((c) => c.id));
  const [clipMeta, sports, athleteMeta, gameTitle] = await Promise.all([
    adminClipMetaByIds(clips.map((c) => c.id)),
    adminGameSports(),
    adminAthleteMeta(),
    adminGameTitle(id),
  ]);
  const sport = sports.get(game.id) ?? "";
  const totalPurchases = clips.reduce(
    (sum, clip) => sum + (purchaseCounts.get(clip.id) ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/games" className="text-sm text-accent hover:underline">
        &larr; All games
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {game.school_a} vs {game.school_b}
          </h1>
          <p className="text-sm text-muted">
            {formatGameDate(game.game_date)}
            {sport ? ` · ${sport}` : ""} &middot; {game.id}
          </p>
        </div>
        {totalPurchases > 0 ? (
          <p className="max-w-xs rounded border border-border p-2 text-xs text-muted">
            Protected: customers bought {totalPurchases} clip(s) from this game, so it can&apos;t be deleted. Unpublish
            its clips instead; buyers keep their downloads.
          </p>
        ) : (
          <ConfirmButton
            action={deleteGameAction}
            fields={{ gameId: game.id }}
            label="Delete game"
            confirmLabel={`Delete game + ${clips.length} clip(s)`}
            confirmPrompt={`Delete "${game.school_a} vs ${game.school_b}" and its ${clips.length} clip(s) + files. No purchases, so nothing else is affected.`}
          />
        )}
      </div>

      <details className="mt-6 rounded-lg border border-border p-4">
        <summary className="cursor-pointer font-semibold">Edit game information</summary>
        <form action={updateGameDetails} className="mt-3 space-y-3">
          <input type="hidden" name="gameId" value={game.id} />
          <input
            name="school_a"
            defaultValue={game.school_a}
            required
            aria-label="Home school"
            className="w-full rounded border border-border px-3 py-2"
          />
          <input
            name="school_b"
            defaultValue={game.school_b}
            required
            aria-label="Away school / opponent"
            className="w-full rounded border border-border px-3 py-2"
          />
          <input
            name="game_date"
            type="date"
            defaultValue={game.game_date}
            required
            aria-label="Game date"
            className="w-full rounded border border-border px-3 py-2"
          />
          <input
            name="sport"
            defaultValue={sport}
            placeholder="Sport"
            aria-label="Sport"
            className="w-full rounded border border-border px-3 py-2"
          />
          <input
            name="title"
            defaultValue={gameTitle}
            placeholder="Game title or details (optional)"
            aria-label="Game title or details"
            className="w-full rounded border border-border px-3 py-2"
          />
          <button type="submit" className="rounded bg-accent px-3 py-2 font-medium text-white">
            Save game information
          </button>
          <p className="text-xs text-muted">Clips, purchases and files are not changed.</p>
        </form>
      </details>

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
          const purchases = purchaseCounts.get(clip.id) ?? 0;

          return (
            <div
              key={clip.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {clipMeta.get(clip.id)?.jersey
                    ? `#${clipMeta.get(clip.id)?.jersey}`
                    : athlete
                      ? `${athlete.name}${athlete.jersey_number ? ` #${athlete.jersey_number}` : ""}`
                      : "No jersey number"}
                  {clipMeta.get(clip.id)?.school ? ` · ${clipMeta.get(clip.id)?.school}` : ""}
                </p>
                <p className="text-muted">
                  {formatPrice(clip.price)} &middot;{" "}
                  {clip.published ? "Published" : "Unpublished"} &middot;{" "}
                  {purchases} purchase{purchases === 1 ? "" : "s"}
                </p>
                <form action={updateClipMeta} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="clipId" value={clip.id} />
                  <select
                    name="athleteId"
                    defaultValue={clip.athlete_id ?? ""}
                    aria-label="Athlete profile"
                    className="rounded border border-border px-2 py-1 text-sm"
                    >
                    <option value="">No athlete profile</option>
                    {athletes
                      .filter(
                        (a) =>
                          a.id === clip.athlete_id ||
                          [game.school_a, game.school_b].some(
                            (s) => s.toLowerCase() === (athleteMeta.get(a.id)?.school ?? "").toLowerCase(),
                          ),
                      )
                      .map((a) => (
                      <option key={a.id} value={a.id}>
                          {a.jersey_number ? `#${a.jersey_number} ` : ""}
                          {a.name || "(no name)"}
                          {athleteMeta.get(a.id)?.school ? ` · ${athleteMeta.get(a.id)?.school}` : ""}
                      </option>
                      ))}
                  </select>
                  <select
                    name="school"
                    defaultValue={clipMeta.get(clip.id)?.school ?? ""}
                    aria-label="School"
                    className="rounded border border-border px-2 py-1 text-sm"
                  >
                    <option value="">School…</option>
                    <option value={game.school_a}>{game.school_a}</option>
                    <option value={game.school_b}>{game.school_b}</option>
                  </select>
                  <input
                    name="jersey"
                    defaultValue={clipMeta.get(clip.id)?.jersey ?? ""}
                    placeholder="Jersey #"
                    aria-label="Jersey number"
                    maxLength={8}
                    className="w-24 rounded border border-border px-2 py-1 text-sm"
                  />
                  <button type="submit" className="rounded border border-border px-2 py-1 text-sm hover:border-accent">
                    Save
                  </button>
                </form>
              </div>

              <div className="flex flex-col items-end gap-2">
                <form
                  action={setClipPublished.bind(null, clip.id, !clip.published)}
                >
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

                {purchases === 0 ? (
                  <ConfirmButton
                    action={deleteClipAction}
                    fields={{ clipId: clip.id }}
                    label="Delete"
                    confirmLabel="Delete clip"
                    confirmPrompt={`Delete this clip and its files from storage? No purchases, so nothing else is affected.`}
                  />
                ) : (
                  <p className="max-w-[11rem] text-right text-xs text-muted">
                    Protected: {purchases} purchase{purchases === 1 ? "" : "s"}. Unpublish instead.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
