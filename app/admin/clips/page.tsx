import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import {
  adminListAthletes,
  adminListClips,
  adminListGames,
  adminPurchaseCountsByClip,
} from "@/lib/admin/queries";
import { formatPrice } from "@/lib/format";
import { adminClipMetaByIds, metaColumnsReady } from "@/lib/admin/clip-meta";
import { adminAthleteMeta } from "@/lib/admin/athlete-meta";
import { updateClipMeta } from "./meta-actions";
import { NewClipForm } from "@/components/admin/new-clip-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { deleteClipAction, setClipPublished } from "./actions";

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
  const purchaseCounts = await adminPurchaseCountsByClip(clips.map((c) => c.id));
  const [clipMeta, metaReady, athleteMeta] = await Promise.all([
    adminClipMetaByIds(clips.map((c) => c.id)),
    metaColumnsReady(),
    adminAthleteMeta(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Clips</h1>

      {!metaReady && (
        <p className="mt-4 rounded border border-accent p-3 text-sm">
          The database update for sport, school and jersey numbers (migration 0006) has not been run yet. Uploads
          still work, but school and jersey number will not be saved until it is.
        </p>
      )}

      <NewClipForm
        games={games.map((game) => ({
          id: game.id,
          label: `${game.school_a} vs ${game.school_b} · ${game.game_date}`,
          schools: [game.school_a, game.school_b],
        }))}
        athletes={athletes
          .filter((a) => athleteMeta.get(a.id)?.school)
          .map((a) => ({
            id: a.id,
            school: athleteMeta.get(a.id)?.school ?? "",
            jersey: a.jersey_number ?? "",
            label: `${a.jersey_number ? `#${a.jersey_number} ` : ""}${a.name || "(no name)"}`,
          }))}
      />

      <div className="mt-6 space-y-2">
        {clips.length === 0 && <p className="text-muted">No clips yet.</p>}
        {clips.map((clip) => {
          const game = gameById.get(clip.game_id);
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
                  {game ? `${game.school_a} vs ${game.school_b}` : "Unknown game"}
                  {clipMeta.get(clip.id)?.jersey ? ` · #${clipMeta.get(clip.id)?.jersey}` : ""}
                  {clipMeta.get(clip.id)?.school ? ` · ${clipMeta.get(clip.id)?.school}` : ""}
                  {athlete ? ` · ${athlete.name}` : ""}
                </p>
                <p className="text-muted">
                  {formatPrice(clip.price)} &middot;{" "}
                  {clip.published ? "Published" : "Unpublished"} &middot;{" "}
                  {purchases} purchase{purchases === 1 ? "" : "s"}
                </p>
                {game && (
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
                )}
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
                    confirmPrompt={`Delete this clip and its preview + original files from storage?\n${
                      game ? `${game.school_a} vs ${game.school_b}` : "Unknown game"
                    }${athlete ? ` · ${athlete.name}` : ""} — ${formatPrice(
                      clip.price,
                    )}\nNo purchases, so nothing else is affected.`}
                  />
                ) : (
                  <ConfirmButton
                    action={deleteClipAction}
                    fields={{ clipId: clip.id, force: "1" }}
                    label="Force delete"
                    confirmLabel={`Delete clip + ${purchases} purchase${
                      purchases === 1 ? "" : "s"
                    }`}
                    confirmPrompt={`This clip has ${purchases} purchase${
                      purchases === 1 ? "" : "s"
                    }. Force delete removes the clip, its files, AND those ${purchases} purchase record(s) — those customers lose their download. Prefer Unpublish unless this is test data.`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
