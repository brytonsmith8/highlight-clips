import Link from "next/link";
import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { adminListAthletes, adminListGames } from "@/lib/admin/queries";
import { adminAthleteMeta } from "@/lib/admin/athlete-meta";
import { adminJerseyOptions, listSavedOptions } from "@/lib/admin/saved-options";
import { getDashboardStats, getRecentClips, parseStatusFilter } from "@/lib/admin/dashboard-data";
import { createAthlete } from "@/app/admin/athletes/actions";
import { UploadWorkspace } from "@/components/admin/upload-workspace";
import { RecentClips } from "@/components/admin/recent-clips";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Tile({ label, value, sub, href }: { label: string; value: number; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </>
  );
  const cls = "rounded-lg border border-border bg-white p-4";
  return href ? (
    <Link href={href} className={cls + " transition-colors hover:border-accent"}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireAdminOrRedirect();
  const status = parseStatusFilter((await searchParams).status);
  const [stats, recent, games, athletes, athleteMeta, saved, jerseyOptions] = await Promise.all([
    getDashboardStats(),
    getRecentClips({ status, limit: 12 }),
    adminListGames(),
    adminListAthletes(),
    adminAthleteMeta(),
    listSavedOptions(),
    adminJerseyOptions(),
  ]);
  const athleteChoices = athletes.map((a) => ({
    id: a.id,
    school: athleteMeta.get(a.id)?.school ?? "",
    label: `${a.jersey_number ? `#${a.jersey_number} ` : ""}${a.name || "(no name)"}${
      athleteMeta.get(a.id)?.school ? ` · ${athleteMeta.get(a.id)?.school}` : ""
    }`,
  }));
  const addOnsOpen = stats.addOnsEditOpen + stats.addOnsShirtOpen;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Clips"
          value={stats.clipsTotal}
          sub={`${stats.clipsPublished} published · ${stats.clipsNotPublished} not published`}
          href="/admin/clips"
        />
        <Tile label="Games" value={stats.gamesTotal} href="/admin/games" />
        <Tile label="Orders" value={stats.ordersTotal} href="/admin/orders" />
        <Tile
          label="Add-ons to fulfill"
          value={addOnsOpen}
          sub={`${stats.addOnsEditOpen} edit${stats.addOnsEditOpen === 1 ? "" : "s"} open · ${stats.addOnsShirtOpen} shirt${stats.addOnsShirtOpen === 1 ? "" : "s"} to ship`}
          href="/admin/orders"
        />
      </div>

      <div className="mt-6">
        <UploadWorkspace
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
          jerseyOptions={jerseyOptions}
          schools={saved.schools}
          sports={saved.sports}
          tablesReady={saved.tablesReady}
        />

        <details className="mt-3 rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">+ Quick add athlete</summary>
          <form action={createAthlete} className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              name="school"
              list="dash-school-list"
              placeholder="School (required)"
              required
              className="rounded border border-border px-3 py-2"
            />
            <datalist id="dash-school-list">
              {saved.schools.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <input name="jersey_number" placeholder="Jersey number" maxLength={8} className="rounded border border-border px-3 py-2" />
            <input name="name" placeholder="Athlete name (optional)" className="rounded border border-border px-3 py-2" />
            <input name="sport" list="dash-sport-list" placeholder="Sport (optional)" className="rounded border border-border px-3 py-2" />
            <datalist id="dash-sport-list">
              {saved.sports.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <button type="submit" className="rounded bg-accent px-3 py-2 font-medium text-white sm:col-span-2">
              Create athlete
            </button>
          </form>
        </details>

        <RecentClips data={recent} status={status} athletes={athleteChoices} />
      </div>
    </div>
  );
}
