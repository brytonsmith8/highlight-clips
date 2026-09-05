import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripeClient, requireStripeWebhookSecret } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { computeDownloadExpiry } from "@/lib/orders";

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
    event = stripe.webhooks.constructEvent(
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

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const clipId = session.metadata?.clip_id;
  const buyerEmail = session.customer_details?.email ?? session.customer_email;

  if (!clipId || !buyerEmail) {
    console.error(
      "[stripe webhook] session missing clip_id or buyer email:",
      session.id,
    );
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceClient();

  const { data: existing, error: existingError } = await supabase
    .from("purchases")
    .select("id")
    .eq("stripe_payment_id", session.id)
    .eq("clip_id", clipId)
    .maybeSingle();

  if (existingError) {
    console.error("[stripe webhook] lookup failed:", existingError.message);
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing) {
    // Already recorded (Stripe retry) — nothing more to do.
    return NextResponse.json({ received: true });
  }

  const purchasedAt = new Date().toISOString();
  const { error: insertError } = await supabase.from("purchases").insert({
    id: crypto.randomUUID(),
    clip_id: clipId,
    buyer_email: buyerEmail,
    stripe_payment_id: session.id,
    purchased_at: purchasedAt,
  });

  if (insertError) {
    console.error("[stripe webhook] failed to record purchase:", insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: clip } = await supabase
    .from("clips")
    .select("price, game_id")
    .eq("id", clipId)
    .maybeSingle();
  const { data: game } = clip
    ? await supabase
        .from("games")
        .select("school_a, school_b")
        .eq("id", clip.game_id)
        .maybeSingle()
    : { data: null };

  try {
    await sendOrderConfirmationEmail({
      to: buyerEmail,
      token: session.id,
      clips: [
        {
          schoolA: game?.school_a ?? "Unknown",
          schoolB: game?.school_b ?? "Unknown",
          priceDollars: clip?.price ?? 0,
        },
      ],
      expiresAt: computeDownloadExpiry(purchasedAt),
    });
  } catch (emailError) {
    // The purchase is recorded either way; email failure shouldn't fail the webhook.
    console.error("[stripe webhook] failed to send confirmation email:", emailError);
  }

  return NextResponse.json({ received: true });
}
