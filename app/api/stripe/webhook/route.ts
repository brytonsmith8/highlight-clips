import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripeClient, requireStripeWebhookSecret } from "@/lib/stripe";
import { recordClipPurchase } from "@/lib/clip-orders";
import { handleMerchCheckoutCompleted } from "@/lib/merch-order";
import { handleChargeRefunded, handleDispute } from "@/lib/order-access";

/**
 * Records a purchase after a completed Stripe Checkout and emails the
 * customer their private download link.
 *
 * Signature-verified against the raw request body (must read `.text()`,
 * never `.json()`, before verification). Idempotent on
 * (stripe_payment_id, clip_id) so a Stripe retry can't double-record.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      requireStripeWebhookSecret(),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  // Refunds and disputes: suspend / restore / flag access for the matching clip order. Anything that is not
  // one of our clip orders (merchandise, unknown payments) is acknowledged and ignored. A database or Stripe
  // lookup failure answers 500 so Stripe retries the event.
  if (
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.closed"
  ) {
    try {
      const outcome =
        event.type === "charge.refunded"
          ? await handleChargeRefunded(stripe, event.data.object as Stripe.Charge)
          : await handleDispute(stripe, event.data.object as Stripe.Dispute, event.type);
      console.log("[stripe webhook]", event.type, outcome.handled ? "applied:" : "ignored:", outcome.detail);
      return NextResponse.json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not process event.";
      console.error("[stripe webhook] failed to process", event.type, message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Merch orders are handled separately and never touch the clip purchase path.
  if (session.metadata?.type === "merch") {
    await handleMerchCheckoutCompleted(stripe, session);
    return NextResponse.json({ received: true });
  }

  // A completed Checkout is not always a paid one (delayed payment methods). Only grant
  // download access once the money has actually been received; a delayed payment is
  // recorded later by the async_payment_succeeded event.
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  // One or many clips (`clip_ids`), all recorded under this session with ONE Scripture.
  // Idempotent: a Stripe retry skips clips that are already recorded.
  try {
    await recordClipPurchase(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record purchase.";
    console.error("[stripe webhook] failed to record purchase:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
