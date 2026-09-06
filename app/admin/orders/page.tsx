import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { adminListOrders } from "@/lib/admin/queries";
import { formatPrice } from "@/lib/format";
import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  deleteOrderAction,
  extendOrderWindowAction,
  resendOrderEmailAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Admin · Orders",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AdminOrdersPage() {
  await requireAdminOrRedirect();
  const orders = await adminListOrders();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin" className="text-sm text-accent hover:underline">
        &larr; Admin
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Orders</h1>
      <p className="mt-1 text-sm text-muted">
        One row per Stripe Checkout. &ldquo;Extend&rdquo; resets the 72-hour
        download window to start now.
      </p>

      <div className="mt-6 space-y-3">
        {orders.length === 0 && <p className="text-muted">No orders yet.</p>}

        {orders.map((order) => {
          const total = order.items.reduce(
            (sum, item) => sum + (item.priceDollars ?? 0),
            0,
          );
          return (
            <div
              key={order.token}
              className="rounded-lg border border-border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm">
                  <p className="font-medium">{order.buyerEmail}</p>
                  <p className="text-muted">
                    {order.items.map((i) => i.label).join(", ")} &middot;{" "}
                    {formatPrice(total)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Bought {fmt(order.purchasedAt)}
                  </p>
                  <p className="text-xs text-muted">
                    {order.expired ? (
                      <span className="font-medium text-red-600">
                        Expired {fmt(order.expiresAt)}
                      </span>
                    ) : (
                      <>Expires {fmt(order.expiresAt)}</>
                    )}
                  </p>
                  {order.items.some((i) => i.clipMissing) && (
                    <p className="text-xs text-amber-700">
                      Some clips in this order have been deleted.
                    </p>
                  )}
                  <p className="mt-1 break-all font-mono text-[10px] text-muted">
                    {order.token}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Link
                    href={`/order/${order.token}`}
                    target="_blank"
                    className="text-xs text-accent hover:underline"
                  >
                    Open download page &nearr;
                  </Link>
                  <ConfirmButton
                    action={resendOrderEmailAction}
                    fields={{ token: order.token }}
                    label="Resend email"
                    tone="normal"
                    confirmLabel="Send"
                    confirmPrompt={`Re-send the confirmation email with the download link to ${order.buyerEmail}? No data changes.`}
                  />
                  <ConfirmButton
                    action={extendOrderWindowAction}
                    fields={{ token: order.token }}
                    label="Extend 72h"
                    tone="normal"
                    confirmLabel="Reset window"
                    confirmPrompt={`Reset this order's download window to a fresh 72 hours from now? This updates purchased_at on ${order.items.length} row(s).`}
                  />
                  <ConfirmButton
                    action={deleteOrderAction}
                    fields={{ token: order.token }}
                    label="Delete order"
                    confirmLabel="Delete permanently"
                    confirmPrompt={`Permanently delete ${order.items.length} purchase record(s) for ${order.buyerEmail}.\nThe download link stops working. This cannot be undone.`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
