import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { adminListClips, adminListGames, adminPurchaseCountsByClip } from "@/lib/admin/queries";
import { adminTestClipIds, testFlagReady } from "@/lib/admin/test-clips";
import { markAllPublishedAsTest, toggleClipTest, unpublishAllTestClips } from "./actions";

export const metadata: Metadata = { title: "Admin · Launch", robots: { index: false, follow: false } };

const CHECKLIST = [
  "Run migrations 0006 then 0007 in Supabase (additive only).",
  "Mark your temporary clips as TEST below, then upload real clips with athlete profiles.",
  "Make one real paid purchase yourself (a clip, and a 7-clip BRYT VISION EDIT) and check the email, download and admin order.",
  "Confirm the Resend sending domain is verified so customers (not only you) receive emails.",
  "Confirm the hosting plan allows commercial use and the storage plan fits your video sizes.",
  "When ready, unpublish TEST clips (below). Nothing is ever deleted automatically.",
];

export default async function LaunchPage() {
  await requireAdminOrRedirect();
  const [ready, clips, games] = await Promise.all([testFlagReady(), adminListClips(), adminListGames()]);
  const testIds = ready ? await adminTestClipIds() : new Set<string>();
  const counts = await adminPurchaseCountsByClip(clips.map((c) => c.id));
  const gameName = new Map(games.map((g) => [g.id, `${g.school_a} vs ${g.school_b}`]));
  const published = clips.filter((c) => c.published);
  const testPublished = published.filter((c) => testIds.has(c.id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Launch</h1>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        {CHECKLIST.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>

      {!ready ? (
        <p className="mt-6 rounded border border-accent p-3 text-sm">
          Test-clip marking needs migration 0007, which has not been run yet. Nothing is changed until you run it.
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm">
            {published.length} published clip{published.length === 1 ? "" : "s"}, {testPublished.length} marked TEST.
            Marking never unpublishes or deletes anything.
          </p>
          <form action={markAllPublishedAsTest} className="mt-2">
            <button className="rounded border border-border px-3 py-1 text-sm hover:border-accent">
              Mark all currently published clips as TEST
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {clips.map((c) => {
              const isTest = testIds.has(c.id);
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded border border-border p-2 text-sm">
                  <span>
                    {gameName.get(c.game_id) ?? "Unknown game"} · {c.published ? "Published" : "Unpublished"} ·{" "}
                    {counts.get(c.id) ?? 0} purchase(s)
                    {isTest && <b className="ml-2 rounded bg-yellow-400 px-1 text-black">TEST</b>}
                  </span>
                  <form action={toggleClipTest.bind(null, c.id, !isTest)}>
                    <button className="rounded border border-border px-2 py-1 hover:border-accent">
                      {isTest ? "Mark as real" : "Mark as test"}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>

          <form action={unpublishAllTestClips} className="mt-6 rounded border border-border p-3 text-sm">
            <p className="font-medium">Launch cleanup (optional, later)</p>
            <p className="text-muted">
              Takes every TEST clip off the public site. Files, purchases and rows stay, and you can publish them again.
              Type UNPUBLISH TEST CLIPS to confirm.
            </p>
            <input name="confirm" className="mt-2 w-full rounded border border-border px-2 py-1" autoComplete="off" />
            <button className="mt-2 rounded bg-accent px-3 py-1 font-medium text-white">Unpublish TEST clips</button>
          </form>
        </>
      )}
    </div>
  );
}
