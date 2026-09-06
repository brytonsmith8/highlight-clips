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
            {formatGameDate(game.game_date)} &middot; {game.id}
          </p>
        </div>
        <ConfirmButton
          action={deleteGameAction}
          fields={
            totalPurchases > 0
              ? { gameId: game.id, force: "1" }
              : { gameId: game.id }
          }
          label="Delete game"
          confirmLabel={
            totalPurchases > 0
              ? `Delete game + ${clips.length} clip(s) + ${totalPurchases} purchase(s)`
              : `Delete game + ${clips.length} clip(s)`
          }
          confirmPrompt={
            totalPurchases > 0
              ? `Force delete "${game.school_a} vs ${game.school_b}": removes ${clips.length} clip(s), their files, AND ${totalPurchases} purchase record(s). Those customers lose their downloads. Cannot be undone.`
              : `Delete "${game.school_a} vs ${game.school_b}" and its ${clips.length} clip(s) + files. No purchases, so nothing else is affected.`
          }
        />
      </div>

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
                  {athlete ? athlete.name : "No athlete"}
                  {athlete?.jersey_number ? ` #${athlete.jersey_number}` : ""}
                </p>
                <p className="text-muted">
                  {formatPrice(clip.price)} &middot;{" "}
                  {clip.published ? "Published" : "Unpublished"} &middot;{" "}
                  {purchases} purchase{purchases === 1 ? "" : "s"}
                </p>
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
                  <ConfirmButton
                    action={deleteClipAction}
                    fields={{ clipId: clip.id, force: "1" }}
                    label="Force delete"
                    confirmLabel={`Delete clip + ${purchases} purchase${
                      purchases === 1 ? "" : "s"
                    }`}
                    confirmPrompt={`This clip has ${purchases} purchase${
                      purchases === 1 ? "" : "s"
                    }. Force delete also erases those purchase record(s) and their downloads. Prefer Unpublish unless this is test data.`}
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
