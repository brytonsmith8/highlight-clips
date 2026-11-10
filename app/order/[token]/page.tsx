import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  computeDownloadExpiry,
  getPurchasesForCheckout,
  isDownloadExpired,
} from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase/service";
import { formatGameDate } from "@/lib/format";
import { getOrderScripture } from "@/lib/clip-orders";
import { ScriptureCard } from "@/components/scripture-card";
import {
  THANK_YOU_HEADLINE,
  THANK_YOU_PARAGRAPHS,
  THANK_YOU_SIGNOFF,
} from "@/lib/scriptures";
import { Countdown } from "@/components/countdown";
import { getEditOrderPublic } from "@/lib/edit-orders";
import { editStatusLabel } from "@/lib/edit-offer";
import { accessMessage, getOrderAccess } from "@/lib/order-access";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

// Never cache: this page verifies (and may record) the purchase on each load,
// right after the Stripe redirect.
export const dynamic = "force-dynamic";

interface OrderPageProps {
  params: Promise<{ token: string }>;
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { token } = await params;

  const allPurchases = await getPurchasesForCheckout(token);
  if (allPurchases.length === 0) notFound();

  // One row per clip (guards against a webhook + self-heal double-insert race).
  const purchases = Array.from(
    new Map(allPurchases.map((p) => [p.clip_id, p])).values(),
  );

  // Reaching this point means the payment was verified (rows exist only for paid sessions).
  // The Scripture is saved with the order, so a refresh always shows the same one.
  const scripture = await getOrderScripture(token);
  // The BRYT VISION EDIT add-on (if this order has one). No address or phone is ever shown here.
  const editOrder = await getEditOrderPublic(token);
  // Refunded / disputed orders keep their record but not their downloads.
  const access = await getOrderAccess(token);

  const supabase = createServiceClient();
  const clipIds = purchases.map((p) => p.clip_id);
  const { data: clips } = await supabase
    .from("clips")
    .select("id, game_id")
    .in("id", clipIds);

  const gameIds = Array.from(new Set((clips ?? []).map((c) => c.game_id)));
  const { data: games } =
    gameIds.length > 0
      ? await supabase
          .from("games")
          .select("id, school_a, school_b, game_date")
          .in("id", gameIds)
      : { data: [] };

  const clipById = new Map((clips ?? []).map((c) => [c.id, c]));
  const gameById = new Map((games ?? []).map((g) => [g.id, g]));

  // All clips in one checkout are recorded within the same request, so any
  // purchase's timestamp gives the same expiry — use the first for the page.
  const expiresAt = computeDownloadExpiry(purchases[0].purchased_at);
  const expiresLabel = expiresAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
        <p className="text-lg font-bold">Payment successful &#10003;</p>
        <p className="mt-1 text-sm">
          {purchases.length > 1
            ? `Your ${purchases.length} highlight clips are ready to download below.`
            : "Your highlight clip is ready to download below."}
        </p>
      </div>

      {!access.allowed && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {accessMessage(access.reason)}
        </div>
      )}

      {editOrder && (
        <section className="mt-6 rounded-lg border-2 border-red-600 bg-black p-4 text-white" aria-label="BRYT VISION EDIT">
          <p className="font-display text-2xl font-extrabold uppercase tracking-wide">
            Your BRYT VISION EDIT + <span className="text-red-500">FREE SHIRT</span> is confirmed
          </p>
          <p className="mt-2 text-sm text-white/85">
            Your professionally edited highlight video is in the works and will be ready in about 5&ndash;7 days, or
            sooner. Your free one-sleeve compression shirt ({editOrder.shirtColor}, size {editOrder.shirtSize}
            {editOrder.shirtSleeve ? `, ${editOrder.shirtSleeve} sleeve` : ""}) will ship to the address you entered at
            checkout.
          </p>
          <p className="mt-2 text-sm font-semibold">Status: {editStatusLabel(editOrder.status)}</p>
          {editOrder.delivered && access.allowed && (
            <a
              href={`/api/orders/${token}/edit/download`}
              className="mt-3 inline-block rounded bg-red-600 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white"
            >
              Download your finished edit
            </a>
          )}
          <p className="mt-2 text-xs text-white/60">
            Your selected clips below are yours to download right now. Questions? Reply to your confirmation email.
          </p>
        </section>
      )}

      <section className="mt-6">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {THANK_YOU_HEADLINE}
        </h1>
        {THANK_YOU_PARAGRAPHS.map((text, i) => (
          <p key={i} className="mt-3 leading-relaxed">
            {text}
          </p>
        ))}
      </section>

      <div className="mt-6">
        <ScriptureCard scripture={scripture} />
      </div>

      <p className="mt-6 text-center text-lg font-extrabold tracking-wide">
        {THANK_YOU_SIGNOFF}
      </p>

      <h2 className="mt-10 text-xl font-bold tracking-tight">Your highlight clips</h2>
      <p className="mt-1 text-sm text-muted">
        Download {purchases.length > 1 ? "these clips" : "this clip"} before
        your access window closes.
      </p>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p>Download access expires {expiresLabel}.</p>
        <Countdown expiresAt={expiresAt.toISOString()} />
      </div>

      <div className="mt-6 space-y-3">
        {purchases.map((purchase) => {
          const clip = clipById.get(purchase.clip_id);
          const game = clip ? gameById.get(clip.game_id) : undefined;
          const expired = isDownloadExpired(purchase.purchased_at);

          return (
            <div key={purchase.id} className="rounded-lg border border-border p-4">
              <p className="font-medium">
                {game ? `${game.school_a} vs ${game.school_b}` : "Clip"}
              </p>
              {game && (
                <p className="text-sm text-muted">{formatGameDate(game.game_date)}</p>
              )}

              {!access.allowed ? (
                <p className="mt-3 text-sm text-red-600">{accessMessage(access.reason)}</p>
              ) : expired ? (
                <p className="mt-3 text-sm text-red-600">
                  Download window has expired.
                </p>
              ) : (
                <a
                  href={`/api/orders/${token}/clips/${purchase.clip_id}/download`}
                  className="mt-3 inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-white"
                >
                  Download
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
