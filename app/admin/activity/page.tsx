import Link from "next/link";
import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { ACTIVITY_FILTERS, getActivity, parseActivityFilter } from "@/lib/admin/activity";
import { ActivityList } from "@/components/admin/activity-list";

export const metadata: Metadata = {
  title: "Admin · Activity",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  await requireAdminOrRedirect();
  const filter = parseActivityFilter((await searchParams).type);
  const { items, total } = await getActivity({ filter, limit: 100 });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
      <p className="mt-1 text-sm text-muted">
        Uploads, sales, and fulfillment updates, newest first, built from what the database has recorded. Publishing and
        unpublishing a clip is not recorded anywhere yet, so those events do not appear. Times are Central Time.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5 text-sm">
        {ACTIVITY_FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/admin/activity" : `/admin/activity?type=${f.id}`}
            aria-current={filter === f.id ? "true" : undefined}
            className={
              "rounded-full border px-3 py-1 " +
              (filter === f.id ? "border-accent bg-accent text-white" : "border-border hover:border-accent")
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <ActivityList items={items} />
      {total > items.length && (
        <p className="mt-3 text-sm text-muted">Showing the newest {items.length} of {total}.</p>
      )}
    </div>
  );
}
