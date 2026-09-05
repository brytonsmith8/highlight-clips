import { NextResponse } from "next/server";

import { getStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { publicEnv } from "@/lib/env";

/**
 * Creates a Stripe Checkout Session for a single published clip.
 *
 * The price is always looked up server-side from `clips.price` — a client-
 * supplied price is never trusted. Only published clips can be purchased.
 */
export async function POST(request: Request) {
  let clipId: string;
  try {
    const body = await request.json();
    clipId = String(body?.clipId ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!clipId) {
    return NextResponse.json({ error: "clipId is required." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: clip, error: clipError } = await supabase
    .from("clips")
    .select("id, price, game_id, published")
    .eq("id", clipId)
    .maybeSingle();

  if (clipError) {
    return NextResponse.json({ error: clipError.message }, { status: 500 });
  }
  if (!clip || !clip.published) {
    return NextResponse.json(
      { error: "This clip is not available for purchase." },
      { status: 404 },
    );
  }

  const { data: game } = await supabase
    .from("games")
    .select("school_a, school_b")
    .eq("id", clip.game_id)
    .maybeSingle();

  const productName = game
    ? `${game.school_a} vs ${game.school_b} — Highlight Clip`
    : "Highlight Clip";

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(clip.price * 100),
            product_data: { name: productName },
          },
          quantity: 1,
        },
      ],
      success_url: `${publicEnv.siteUrl}/order/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicEnv.siteUrl}/games/${clip.game_id}`,
      metadata: { clip_id: clip.id },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout is not available right now.";
    console.error("[checkout] failed to create session:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
