import { NextResponse } from "next/server";

import { publicEnv } from "@/lib/env";
import {
  MAX_LINES,
  PRODUCT,
  SHIPPING_CENTS,
  isSoldOut,
  lineDescription,
  lineKey,
  parseLine,
  type CartLine,
} from "@/lib/merch";
import { getStripeClient } from "@/lib/stripe";

/**
 * Creates a Stripe Checkout Session for a merch cart.
 *
 * The browser only says WHICH variants it wants (color/size/sleeve/qty).
 * Every line is validated against the catalog in lib/merch.ts and the price
 * always comes from there — a client-supplied price is never read.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = (await request.json())?.items;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINES) {
    return NextResponse.json({ error: "Your cart is empty or invalid." }, { status: 400 });
  }

  // Validate and merge duplicate variants.
  const merged = new Map<string, CartLine>();
  for (const item of raw) {
    const line = parseLine(item);
    if (!line) {
      return NextResponse.json(
        { error: "One of the items in your cart is not valid." },
        { status: 400 },
      );
    }
    if (isSoldOut(line.color, line.size)) {
      return NextResponse.json(
        { error: `${lineDescription(line)} is sold out.` },
        { status: 409 },
      );
    }
    const key = lineKey(line);
    const prev = merged.get(key);
    merged.set(key, prev ? { ...line, qty: Math.min(10, prev.qty + line.qty) } : line);
  }

  const siteUrl = publicEnv.siteUrl;
  const canShowImages = siteUrl.startsWith("https://");

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: Array.from(merged.values()).map((line) => ({
        quantity: line.qty,
        price_data: {
          currency: "usd",
          unit_amount: PRODUCT.priceCents,
          product_data: {
            name: lineDescription(line),
            ...(canShowImages
              ? { images: [`${siteUrl}/merch/${line.color}-front.webp`] }
              : {}),
          },
        },
      })),
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: SHIPPING_CENTS, currency: "usd" },
            display_name: "Standard shipping (US)",
          },
        },
      ],
      phone_number_collection: { enabled: true },
      metadata: { type: "merch" },
      success_url: `${siteUrl}/merch/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/merch/cart`,
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
    console.error("[merch checkout] failed to create session:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
