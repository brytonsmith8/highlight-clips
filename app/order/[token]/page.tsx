import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  computeDownloadExpiry,
  getPurchasesForCheckout,
  isDownloadExpired,
} from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase/service";
import { formatGameDate, formatPrice } from "@/lib/format";
import { Countdown } from "@/components/countdown";

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

  const supabase = createServiceClient();
  const clipIds = purchases.map((p) => p.clip_id);
  const { data: clips } = await supabase
    .from("clips")
    .select("id, price, game_id")
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
      <h1 className="text-2xl font-bold tracking-tight">Your purchase</h1>
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
              {clip && <p className="mt-1 text-sm">{formatPrice(clip.price)}</p>}

              {expired ? (
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
