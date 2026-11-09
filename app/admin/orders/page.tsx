import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { adminListOrders } from "@/lib/admin/queries";
import { formatPrice } from "@/lib/format";
import { listEditOrders } from "@/lib/edit-orders";
import { ADMIN_SETTABLE_STATUSES, EDIT_STATUSES, editStatusLabel } from "@/lib/edit-offer";
import { setEditStatusAction } from "./edit-actions";
import { EditDeliveryUpload } from "@/components/admin/edit-delivery-upload";
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
  const [orders, editOrders] = await Promise.all([adminListOrders(), listEditOrders()]);
  const editTokens = new Set(editOrders.map((e) => e.stripe_session_id));
  const needsWork = editOrders.filter((e) => e.status !== "fulfilled");

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

      {editOrders.length > 0 && (
        <section aria-label="BRYT VISION EDIT orders" className="mt-6 rounded-lg border-2 border-accent p-4">
          <h2 className="text-lg font-bold">
            BRYT VISION EDIT + FREE SHIRT orders{" "}
            <span className="text-sm font-semibold text-accent">
              ({needsWork.length} need{needsWork.length === 1 ? "s" : ""} work)
            </span>
          </h2>
          <div className="mt-3 space-y-3">
            {[...editOrders]
              .sort((a, b) => Number(a.status === "fulfilled") - Number(b.status === "fulfilled"))
              .map((e) => (
                <div key={e.id} className="rounded border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold">
                      BRYT VISION EDIT purchased &middot; {formatPrice(e.edit_price_cents / 100)} add-on
                    </p>
                    <span
                      className={
                        "rounded-full px-3 py-1 text-xs font-semibold " +
                        (e.status === "fulfilled" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")
                      }
                    >
                      {editStatusLabel(e.status)}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-muted">Payment</dt>
                    <dd>{e.payment_status === "paid" ? "Paid (verified by Stripe)" : e.payment_status}</dd>
                    <dt className="text-muted">Order date</dt>
                    <dd>{fmt(e.created_at)}</dd>
                    <dt className="text-muted">Customer</dt>
                    <dd>
                      {e.customer_name ?? "—"} &middot; {e.customer_email ?? "—"}
                      {e.customer_phone ? ` · ${e.customer_phone}` : ""}
                    </dd>
                    <dt className="text-muted">Ship to</dt>
                    <dd>
                      {[e.ship_name, e.ship_line1, e.ship_line2].filter(Boolean).join(", ")}
                      <br />
                      {[e.ship_city, e.ship_state, e.ship_postal_code].filter(Boolean).join(", ")} {e.ship_country ?? ""}
                    </dd>
                    <dt className="text-muted">Athlete</dt>
                    <dd>
                      {e.athlete_name || "(no name)"} &middot; #{e.athlete_jersey ?? "?"} &middot;{" "}
                      {e.athlete_school ?? "school not set"}
                      <br />
                      <span className="font-mono text-[10px] text-muted">Athlete ID {e.athlete_id}</span>
                    </dd>
                    <dt className="text-muted">Shirt</dt>
                    <dd>
                      {e.shirt_color ?? "?"}, size {e.shirt_size ?? "?"}
                      {e.shirt_sleeve ? `, ${e.shirt_sleeve} sleeve` : ""}
                    </dd>
                    <dt className="text-muted">Clips ({e.clips.length})</dt>
                    <dd>
                      <ul className="list-disc pl-4">
                        {e.clips.map((c) => (
                          <li key={c.clipId}>
                            {c.game}
                            {c.date ? ` · ${c.date}` : ""}
                            {c.jersey ? ` · #${c.jersey}` : ""}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </dl>
                  <form action={setEditStatusAction} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="sessionId" value={e.stripe_session_id} />
                    <select
                      name="status"
                      defaultValue={e.status}
                      aria-label="Fulfillment status"
                      className="rounded border border-border px-2 py-1"
                    >
                      {EDIT_STATUSES.filter(
                        (s) => s.id === e.status || (ADMIN_SETTABLE_STATUSES as readonly string[]).includes(s.id),
                      ).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded bg-accent px-3 py-1 font-medium text-white">
                      Update status
                    </button>
                    <span className="font-mono text-[10px] text-muted">{e.stripe_session_id}</span>
                  </form>
                  <EditDeliveryUpload sessionId={e.stripe_session_id} delivered={!!e.delivery_path} />
                </div>
              ))}
          </div>
        </section>
      )}

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
                  {editTokens.has(order.token) && (
                    <p className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                      Includes BRYT VISION EDIT + free shirt (see above)
                    </p>
                  )}
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
