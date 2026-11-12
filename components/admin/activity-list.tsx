import Link from "next/link";

import type { ActivityItem, ActivityType } from "@/lib/admin/activity";

const TYPE_LABEL: Record<ActivityType, string> = { sale: "Sale", upload: "Upload", fulfillment: "Fulfillment" };
const TYPE_STYLE: Record<ActivityType, string> = {
  sale: "bg-green-100 text-green-900",
  upload: "bg-sky-100 text-sky-900",
  fulfillment: "bg-amber-100 text-amber-900",
};

/** Central Time, since that is where the business runs; the zone is shown so nothing is ambiguous. */
export function formatActivityTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  }) + " CT";
}

export function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <p className="mt-3 text-sm text-muted">Nothing here yet.</p>;
  return (
    <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-white">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 p-3 text-sm">
          <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + TYPE_STYLE[item.type]}>
            {TYPE_LABEL[item.type]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {item.href ? (
                <Link href={item.href} className="hover:text-accent hover:underline">
                  {item.title}
                </Link>
              ) : (
                item.title
              )}
            </p>
            {item.detail && <p className="break-words text-muted">{item.detail}</p>}
          </div>
          <time dateTime={item.at} className="whitespace-nowrap text-xs text-muted">
            {formatActivityTime(item.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
