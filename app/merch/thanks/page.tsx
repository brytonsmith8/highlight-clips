import type { Metadata } from "next";
import Link from "next/link";

import { ClearCart } from "@/components/merch/clear-cart";
import { formatPrice } from "@/lib/format";
import { summarizeMerchSession } from "@/lib/merch-order";
import { getStripeClient } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MerchThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const raw = (await searchParams).session_id;
  const sessionId = Array.isArray(raw) ? raw[0] : raw;

  let summary: Awaited<ReturnType<typeof summarizeMerchSession>> | null = null;
  let status: "paid" | "unpaid" | "missing" = "missing";

  if (sessionId && /^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    try {
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.type === "merch") {
        if (session.payment_status === "paid") {
          status = "paid";
          summary = await summarizeMerchSession(stripe, session);
        } else {
          status = "unpaid";
        }
      }
    } catch (err) {
      console.error("[merch thanks] could not load session:", err);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {status === "paid" && summary ? (
        <>
          <ClearCart />
          <h1 className="font-display text-5xl font-extrabold uppercase leading-none tracking-tight">
            Thank you
          </h1>
          <p className="mt-3 text-muted">
            Your payment was received. A confirmation email is on its way.
          </p>

          <ul className="mt-6 divide-y divide-border border-y border-border text-sm">
            {summary.lines.map((line, i) => (
              <li key={i} className="flex justify-between gap-4 py-3">
                <span>
                  {line.description} &times; {line.quantity}
                </span>
                <span className="font-semibold">{formatPrice(line.totalDollars)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between text-sm font-semibold">
            <span>Total paid</span>
            <span>{formatPrice(summary.totalDollars)}</span>
          </p>

          {summary.shippingLines.length > 0 && (
            <div className="mt-6 text-sm">
              <p className="font-semibold">Shipping to</p>
              {summary.shippingLines.map((l, i) => (
                <p key={i} className="text-muted">
                  {l}
                </p>
              ))}
            </div>
          )}
        </>
      ) : status === "unpaid" ? (
        <>
          <h1 className="text-2xl font-bold">Payment not confirmed yet</h1>
          <p className="mt-2 text-muted">
            We haven&apos;t received confirmation of payment. If you were
            charged, refresh this page in a minute.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Order not found</h1>
          <p className="mt-2 text-muted">
            We couldn&apos;t find that order. Check the link in your
            confirmation email.
          </p>
        </>
      )}

      <Link
        href="/merch"
        className="mt-8 inline-block text-sm text-accent hover:underline"
      >
        &larr; Back to merch
      </Link>
    </div>
  );
}
