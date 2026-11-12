import Link from "next/link";
import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { getDashboardStats } from "@/lib/admin/dashboard-data";

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

export default async function AdminDashboard() {
  await requireAdminOrRedirect();
  const stats = await getDashboardStats();
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
    </div>
  );
}
