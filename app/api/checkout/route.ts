import { NextResponse } from "next/server";

import { getStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { publicEnv } from "@/lib/env";
import { MAX_CLIPS_PER_ORDER, priceForCount } from "@/lib/pricing";
import { EDIT_MIN_CLIPS, EDIT_PRICE_CENTS, EDIT_TITLE, athleteQualifies } from "@/lib/edit-offer";
import { COLORS, SHIPPING_CENTS, SIZES, isSoldOut, sleeveLabel, type ColorId, type SizeId, type Sleeve } from "@/lib/merch";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EditRequest {
  athleteId: string;
  size: SizeId;
  color: ColorId;
  sleeve: Sleeve;
}

/** Validates the optional BRYT VISION EDIT part of the request body. Returns null when there is none. */
function parseEdit(raw: unknown): EditRequest | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") return "invalid";
  const o = raw as Record<string, unknown>;
  const athleteId = typeof o.athleteId === "string" && UUID.test(o.athleteId) ? o.athleteId.toLowerCase() : null;
  const size = SIZES.find((s) => s.id === o.size)?.id;
  const color = COLORS.find((c) => c.id === o.color)?.id;
  const sleeve = o.sleeve === "left" || o.sleeve === "right" ? (o.sleeve as Sleeve) : null;
  if (!athleteId || !size || !color || !sleeve) return "invalid";
  return { athleteId, size, color, sleeve };
}

/**
 * Creates ONE Stripe Checkout Session for one or more published clips (any games).
 *
 * The price is ALWAYS computed here from the number of clips (see lib/pricing.ts): $12.50 each,
 * or $10.50 each for 4 or more. Nothing price-related from the browser is read, and the
 * per-clip `clips.price` column is ignored. Every clip id is validated: well-formed, no
 * duplicates, exists, published and has an original.
 *
 * Optional BRYT VISION EDIT + FREE SHIRT add-on (`edit`): a fixed extra $55 line item. The server
 * itself checks that at least 7 of the selected clips belong to the named athlete profile, that the
 * shirt options are real and in stock, and that the add-on table exists. It collects the shipping
 * address in Stripe Checkout (US only, free shipping: the shirt is included in the $55).
 *
 * Accepts `{ clipIds: string[], edit?: {...} }`; the older `{ clipId }` shape is still understood.
 */
export async function POST(request: Request) {
  let ids: unknown;
  let editRaw: unknown;
  try {
    const body = await request.json();
    ids = Array.isArray(body?.clipIds)
      ? body.clipIds
      : body?.clipId !== undefined
        ? [body.clipId]
        : undefined;
    editRaw = body?.edit;
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

  const edit = parseEdit(editRaw);
  if (edit === "invalid") {
    return NextResponse.json(
      { error: "Choose a shirt size, color and sleeve for the BRYT VISION EDIT." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data: clips, error: clipError } = await supabase
    .from("clips")
    .select("id, game_id, athlete_id, published, full_url")
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

  const gameIds = Array.from(new Set(clipIds.map((id) => String(found.get(id)!.game_id))));

  const { data: games } = await supabase
    .from("games")
    .select("id, school_a, school_b")
    .in("id", gameIds);
  const gameName = (g: { school_a: string; school_b: string }) => `${g.school_a} vs ${g.school_b}`;
  const singleGame = gameIds.length === 1 ? (games ?? []).find((g) => g.id === gameIds[0]) : undefined;

  const price = priceForCount(clipIds.length);
  const where = singleGame ? gameName(singleGame) : gameIds.length === 1 ? "Game" : "Multiple games";
  const productName =
    clipIds.length === 1
      ? `${where} — Highlight Clip`
      : `${where} — ${clipIds.length} Highlight Clips${price.bundleApplied ? " (bundle price)" : ""}`;

  // ---- optional BRYT VISION EDIT + FREE SHIRT --------------------------------------------------
  let editLine: { name: string; description: string } | null = null;
  if (edit) {
    // The add-on is only sold once its private orders table exists (so a paid add-on can always be recorded).
    const probe = await supabase.from("edit_orders").select("id").limit(1);
    if (probe.error) {
      console.error("[checkout] edit_orders table not ready:", probe.error.message);
      return NextResponse.json(
        { error: "The BRYT VISION EDIT is not available yet. You can still buy your clips." },
        { status: 503 },
      );
    }

    const refs = clipIds.map((id) => ({
      athleteId: found.get(id)!.athlete_id ? String(found.get(id)!.athlete_id).toLowerCase() : null,
    }));
    if (!athleteQualifies(refs, edit.athleteId)) {
      return NextResponse.json(
        {
          error: `The BRYT VISION EDIT needs at least ${EDIT_MIN_CLIPS} selected clips of the same athlete.`,
        },
        { status: 400 },
      );
    }
    if (isSoldOut(edit.color, edit.size)) {
      return NextResponse.json({ error: "That shirt color and size is sold out." }, { status: 409 });
    }

    const { data: athlete } = await supabase
      .from("athletes")
      .select("id, name, jersey_number")
      .eq("id", edit.athleteId)
      .maybeSingle();
    if (!athlete) {
      return NextResponse.json({ error: "That athlete profile was not found." }, { status: 400 });
    }
    const who = [athlete.jersey_number ? `#${athlete.jersey_number}` : "", athlete.name].filter(Boolean).join(" ");
    const color = COLORS.find((c) => c.id === edit.color)!.name;
    const size = SIZES.find((s) => s.id === edit.size)!.label;
    editLine = {
      name: `${EDIT_TITLE}${who ? ` — ${who}` : ""}`,
      description: `Professionally edited highlight video (about 10-35+ seconds, full resolution, ready in about 5-7 days) plus one FREE BRYT VISION one-sleeve compression shirt: ${color}, ${size}, ${sleeveLabel(edit.sleeve)}.`,
    };
  }

  try {
    const stripe = getStripeClient();
    const siteUrl = publicEnv.siteUrl;
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
        ...(editLine
          ? [
              {
                price_data: {
                  currency: "usd",
                  unit_amount: EDIT_PRICE_CENTS,
                  product_data: { name: editLine.name, description: editLine.description },
                },
                quantity: 1,
              },
            ]
          : []),
      ],
      // Shipping details are collected by Stripe Checkout ONLY for the add-on; clip-only orders are unchanged.
      ...(edit
        ? {
            shipping_address_collection: { allowed_countries: ["US" as const] },
            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount" as const,
                  fixed_amount: { amount: SHIPPING_CENTS, currency: "usd" },
                  display_name: "Free shipping (US) — shirt included",
                },
              },
            ],
            phone_number_collection: { enabled: true },
          }
        : {}),
      success_url: `${siteUrl}/order/{CHECKOUT_SESSION_ID}`,
      cancel_url: gameIds.length === 1 ? `${siteUrl}/games/${gameIds[0]}` : `${siteUrl}/clips`,
      // `clip_id` is kept for single-clip orders so older readers still work.
      metadata: {
        clip_ids: clipIds.join(","),
        ...(clipIds.length === 1 ? { clip_id: clipIds[0] } : {}),
        ...(edit
          ? {
              edit: "1",
              edit_athlete_id: edit.athleteId,
              edit_size: edit.size,
              edit_color: edit.color,
              edit_sleeve: edit.sleeve,
            }
          : {}),
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
