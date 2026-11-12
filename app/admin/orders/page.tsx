import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { adminListOrders } from "@/lib/admin/queries";
import { formatPrice } from "@/lib/format";
import { formatCents } from "@/lib/pricing";
import { effectiveAccess, listOrderAccessFlags } from "@/lib/order-access";
import { listEditOrdersChecked } from "@/lib/edit-orders";
import {
  EDIT_PRICE_CENTS,
  EDIT_TRACK_STATUSES,
  SHIRT_CARRIERS,
  SHIRT_SHIP_ESTIMATE,
  SHIRT_STATUSES,
  editTrackLabel,
  formatOrderNumber,
  shirtStatusLabel,
} from "@/lib/edit-offer";
import { setEditTrackAction, setShirtFulfillmentAction } from "./edit-actions";
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

/** Refund / dispute state of an order, shown in red so it is never missed. Nothing here changes access by itself. */
function AccessBadge({ flags }: { flags: ReturnType<typeof listOrderAccessFlags> extends Promise<Map<string, infer F>> ? F | undefined : never }) {
  if (!flags) return null;
  const a = effectiveAccess(flags);
  const labels: string[] = [];
  if (flags.refund_status === "full") labels.push("FULLY REFUNDED: downloads revoked");
  if (flags.refund_status === "partial") labels.push("PARTIAL REFUND: review manually (clips NOT revoked)");
  if (flags.dispute_status === "open") labels.push("DISPUTE OPEN: downloads suspended");
  if (flags.dispute_status === "lost") labels.push("DISPUTE LOST: downloads revoked");
  if (flags.dispute_status === "won") labels.push("Dispute won");
  if (flags.needs_review && !labels.some((l) => l.startsWith("PARTIAL"))) labels.push("Needs manual review");
  if (labels.length === 0) return null;
  return (
    <p className={"mt-1 rounded border p-2 text-xs font-semibold " + (a.allowed ? "border-amber-400 bg-amber-50 text-amber-900" : "border-red-500 bg-red-50 text-red-800")}>
      {labels.join(" · ")}
      {flags.note ? <span className="block font-normal">{flags.note}</span> : null}
    </p>
  );
}

export default async function AdminOrdersPage() {
  await requireAdminOrRedirect();
  const [orders, editRead, accessFlags] = await Promise.all([adminListOrders(), listEditOrdersChecked(), listOrderAccessFlags()]);
  const editOrders = editRead.rows;
  const editTokens = new Set(editOrders.map((e) => e.stripe_session_id));
  const isDone = (e: (typeof editOrders)[number]) =>
    (e.edit_status ?? "awaiting_edit") === "delivered" && (e.shirt_status ?? "awaiting_shipment") === "delivered";
  const needsWork = editOrders.filter((e) => !isDone(e));

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

      {editRead.error && (
        <section
          aria-label="BRYT VISION EDIT orders could not be loaded"
          role="alert"
          className="mt-6 rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-900"
        >
          <h2 className="text-lg font-bold">BRYT VISION EDIT + FREE SHIRT orders could not be loaded</h2>
          <p className="mt-1 text-sm">
            The add-on orders list failed to load, so paid add-ons may exist that are not shown below. Do not assume there are
            none. Refresh the page; if this stays, check the database connection.
          </p>
          <p className="mt-1 text-xs [overflow-wrap:anywhere]">Details: {editRead.error}</p>
        </section>
      )}

      {!editRead.error && editOrders.length === 0 && (
        <section aria-label="BRYT VISION EDIT orders" className="mt-6 rounded-lg border-2 border-accent p-4">
          <h2 className="text-lg font-bold">BRYT VISION EDIT + FREE SHIRT orders: None yet.</h2>
          <p className="mt-1 text-sm text-muted">
            When a customer buys the BRYT VISION EDIT add-on, it appears here with its BV order number, shirt shipping
            (carrier, tracking, shipped and delivered dates), edit status, and the tracking-email options. Orders of clips
            only are listed below.
          </p>
        </section>
      )}

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
              .sort((a, b) => Number(isDone(a)) - Number(isDone(b)))
              .map((e) => (
                <details key={e.id} open={!isDone(e)} className="rounded border border-border p-3 text-sm">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold [overflow-wrap:anywhere]">
                        {formatOrderNumber(e.order_number, e.id)} &middot; {e.customer_name ?? "(no name)"} &middot;{" "}
                        {e.athlete_name || "(no athlete)"}
                        <span className="ml-2 font-normal text-muted">
                          {fmt(e.created_at)}
                          {typeof e.session_total_cents === "number" ? ` · ${formatPrice(e.session_total_cents / 100)} paid` : ""}
                        </span>
                      </p>
                      <span className="flex flex-wrap gap-1">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                          Edit: {editTrackLabel(e.edit_status)}
                        </span>
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                          Shirt: {shirtStatusLabel(e.shirt_status)}
                        </span>
                      </span>
                    </div>
                  </summary>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 [overflow-wrap:anywhere] sm:grid-cols-[10rem_minmax(0,1fr)]">
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
                  <p className="mt-3 text-xs text-muted">
                    The free shirt is included with the {formatCents(EDIT_PRICE_CENTS)} add-on (no extra charge). Estimated dispatch:{" "}
                    {SHIRT_SHIP_ESTIMATE}.
                  </p>
                  <form action={setEditTrackAction} className="mt-3 space-y-2 rounded border border-border p-2">
                    <input type="hidden" name="sessionId" value={e.stripe_session_id} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Highlight edit</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select name="editStatus" defaultValue={e.edit_status ?? "awaiting_edit"} aria-label="Edit status" className="rounded border border-border px-2 py-2">
                        {EDIT_TRACK_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      <button type="submit" className="rounded bg-accent px-3 py-2 font-medium text-white">Save edit status</button>
                    </div>
                    <textarea
                      name="notes"
                      defaultValue={e.admin_notes ?? ""}
                      rows={3}
                      maxLength={4000}
                      placeholder="Internal notes: what to edit, special instructions (never shown to the customer)"
                      className="w-full rounded border border-border px-2 py-1"
                    />
                  </form>
                  <form action={setShirtFulfillmentAction} className="mt-3 space-y-2 rounded border border-border p-2">
                    <input type="hidden" name="sessionId" value={e.stripe_session_id} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Free shirt shipment</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select name="shirtStatus" defaultValue={e.shirt_status ?? "awaiting_shipment"} aria-label="Shirt status" className="rounded border border-border px-2 py-2">
                        {SHIRT_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      <select name="carrier" defaultValue={e.shirt_carrier ?? ""} aria-label="Carrier" className="rounded border border-border px-2 py-2">
                        <option value="">Carrier…</option>
                        {SHIRT_CARRIERS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        name="tracking"
                        defaultValue={e.shirt_tracking_number ?? ""}
                        placeholder="Tracking number"
                        aria-label="Tracking number"
                        maxLength={40}
                        className="min-w-0 flex-1 rounded border border-border px-2 py-2"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="emailCustomer" defaultChecked={!e.tracking_emailed_at} />
                      Email the customer the tracking info (when marking Shipped or Delivered)
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="markEmailed" />
                      I already emailed the tracking myself: just record it as emailed (sends nothing)
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="submit" className="rounded bg-accent px-3 py-2 font-medium text-white">Save shirt status</button>
                      {e.tracking_emailed_at && (
                        <span className="text-xs text-muted">Tracking emailed {fmt(e.tracking_emailed_at)}</span>
                      )}
                    </div>
                  </form>
                  <p className="mt-1 font-mono text-[10px] text-muted [overflow-wrap:anywhere]">{e.stripe_session_id}</p>
                  <p className="mt-2 text-xs text-muted">
                    Payment: {e.payment_status} &middot; Delivery:{" "}
                    {e.delivery_path
                      ? `delivered ${new Date(e.delivered_at ?? e.created_at).toLocaleString("en-US")}`
                      : "not delivered yet"}
                    {e.delivery_path &&
                      ` · ${e.first_downloaded_at ? `customer downloaded ${e.download_count ?? 1}× (first ${new Date(e.first_downloaded_at).toLocaleString("en-US")})` : "not downloaded yet"}`}
                  </p>
                  <AccessBadge flags={accessFlags.get(e.stripe_session_id)} />
                  <EditDeliveryUpload sessionId={e.stripe_session_id} delivered={!!e.delivery_path} />
                </details>
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
                  <AccessBadge flags={accessFlags.get(order.token)} />
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
