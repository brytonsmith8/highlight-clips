import "server-only";

import Stripe from "stripe";

function requireStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.trim() === "") {
    throw new Error("Missing required environment variable: STRIPE_SECRET_KEY.");
  }
  return key;
}

/** Server-only Stripe client. Lazily reads the key so importing this module never throws. */
export function getStripeClient(): Stripe {
  return new Stripe(requireStripeSecretKey());
}

export function requireStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || secret.trim() === "") {
    throw new Error(
      "Missing required environment variable: STRIPE_WEBHOOK_SECRET.",
    );
  }
  return secret;
}
