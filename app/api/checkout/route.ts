import { NextResponse } from "next/server";

import { getStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { publicEnv } from "@/lib/env";
import { MAX_CLIPS_PER_ORDER, priceForCount } from "@/lib/pricing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates ONE Stripe Checkout Session for one or more published clips from the same game.
 *
 * The price is ALWAYS computed here from the number of clips (see lib/pricing.ts): $12.50 each,
 * or $10.50 each for 4 or more. Nothing price-related from the browser is read, and the
 * per-clip `clips.price` column is ignored. Every clip id is validated: well-formed, no
 * duplicates, exists, published, has an original, and all from the same game.
 *
 * Accepts `{ clipIds: string[] }` (a single-clip buy sends one id); the older `{ clipId }` shape
 * is still understood.
 */
export async function POST(request: Request) {
  let ids: unknown;
  try {
    const body = await request.json();
    ids = Array.isArray(body?.clipIds)
      ? body.clipIds
      : body?.clipId !== undefined
        ? [body.clipId]
        : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Select at least one clip." }, { status: 400 });
  }
  if (ids.length > MAX_CLIPS_PER_ORDER) {
    return NextResponse.json(
      { error: `You can buy up to ${MAX_CLIPS_PER_ORDER} clips in one order.` },
      { status: 400 },
    );
  }
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) {
    return NextResponse.json({ error: "One or more clips are invalid." }, { status: 400 });
  }
  const clipIds = (ids as string[]).map((id) => id.toLowerCase());
  if (new Set(clipIds).size !== clipIds.length) {
    return NextResponse.json(
      { error: "The same clip was selected more than once." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data: clips, error: clipError } = await supabase
    .from("clips")
    .select("id, game_id, published, full_url")
    .in("id", clipIds);

  if (clipError) {
    console.error("[checkout] clip lookup failed:", clipError.message);
    return NextResponse.json({ error: "Checkout is not available right now." }, { status: 500 });
  }

  const found = new Map((clips ?? []).map((c) => [String(c.id).toLowerCase(), c]));
  const unavailable = clipIds.some((id) => {
    const c = found.get(id);
    return !c || !c.published || !c.full_url;
  });
  if (unavailable) {
    return NextResponse.json(
      { error: "One or more clips are not available for purchase." },
      { status: 404 },
    );
  }

  const gameIds = new Set(clipIds.map((id) => found.get(id)!.game_id));
  if (gameIds.size !== 1) {
    return NextResponse.json(
      { error: "Clips in one order must be from the same game." },
      { status: 400 },
    );
  }
  const gameId = [...gameIds][0] as string;

  const { data: game } = await supabase
    .from("games")
    .select("school_a, school_b")
    .eq("id", gameId)
    .maybeSingle();

  const gameName = game ? `${game.school_a} vs ${game.school_b}` : "Game";
  const price = priceForCount(clipIds.length);
  const productName =
    clipIds.length === 1
      ? `${gameName} — Highlight Clip`
      : `${gameName} — ${clipIds.length} Highlight Clips${price.bundleApplied ? " (bundle price)" : ""}`;

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: price.unitCents,
            product_data: { name: productName },
          },
          quantity: clipIds.length,
        },
      ],
      success_url: `${publicEnv.siteUrl}/order/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicEnv.siteUrl}/games/${gameId}`,
      // `clip_id` is kept for single-clip orders so older readers still work.
      metadata: {
        clip_ids: clipIds.join(","),
        ...(clipIds.length === 1 ? { clip_id: clipIds[0] } : {}),
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create checkout session." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout is not available right now.";
    console.error("[checkout] failed to create session:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
