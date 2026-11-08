import "server-only";

import type Stripe from "stripe";

import { sendMerchConfirmationEmail } from "@/lib/email";

export interface MerchOrderLine {
  description: string;
  quantity: number;
  totalDollars: number;
}

export interface MerchOrderSummary {
  lines: MerchOrderLine[];
  totalDollars: number;
  shippingLines: string[];
}

/** Reads a paid merch Checkout Session into a plain summary (items, total, address). */
export async function summarizeMerchSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<MerchOrderSummary> {
  const items = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 50,
  });
  const lines = items.data.map((item) => ({
    description: item.description ?? "BRYT VISION merch",
    quantity: item.quantity ?? 1,
    totalDollars: item.amount_total / 100,
  }));

  const shipping = session.collected_information?.shipping_details;
  const a = shipping?.address;
  const shippingLines = shipping
    ? [
        shipping.name,
        a?.line1,
        a?.line2,
        [a?.city, a?.state, a?.postal_code].filter(Boolean).join(", "),
        a?.country,
      ].filter((v): v is string => Boolean(v))
    : [];

  return {
    lines,
    totalDollars: (session.amount_total ?? 0) / 100,
    shippingLines,
  };
}

/**
 * Handles `checkout.session.completed` for a merch order: confirms payment,
 * then emails the customer. Stripe itself is the order record (payment,
 * shipping address, phone) — see the Stripe Dashboard → Payments.
 *
 * Throws only when Stripe can't be read (so Stripe retries the webhook). A
 * failed email is logged, never thrown, so a retry can't double-send.
 */
export async function handleMerchCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.payment_status !== "paid") {
    console.error(
      "[stripe webhook] merch session not paid, skipping:",
      session.id,
      session.payment_status,
    );
    return;
  }

  const buyerEmail = session.customer_details?.email ?? session.customer_email;
  if (!buyerEmail) {
    console.error("[stripe webhook] merch session has no email:", session.id);
    return;
  }

  const summary = await summarizeMerchSession(stripe, session);

  try {
    await sendMerchConfirmationEmail({
      to: buyerEmail,
      orderRef: session.id,
      lines: summary.lines,
      totalDollars: summary.totalDollars,
      shippingLines: summary.shippingLines,
    });
  } catch (emailError) {
    console.error("[stripe webhook] failed to send merch email:", emailError);
  }
}
