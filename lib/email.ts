import "server-only";

import { Resend } from "resend";

import { publicEnv } from "@/lib/env";

function requireResendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error("Missing required environment variable: RESEND_API_KEY.");
  }
  return key;
}

function requireEmailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (!from || from.trim() === "") {
    throw new Error("Missing required environment variable: EMAIL_FROM.");
  }
  return from;
}

export interface PurchasedClipSummary {
  schoolA: string;
  schoolB: string;
  priceDollars: number;
}

/** Sends the private order-link email after a successful checkout. */
export async function sendOrderConfirmationEmail(params: {
  to: string;
  token: string;
  clips: PurchasedClipSummary[];
  expiresAt: Date;
}): Promise<void> {
  const resend = new Resend(requireResendApiKey());
  const orderUrl = `${publicEnv.siteUrl}/order/${params.token}`;
  const expiresLabel = params.expiresAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const clipLines = params.clips
    .map((c) => `<li>${c.schoolA} vs ${c.schoolB} — $${c.priceDollars.toFixed(2)}</li>`)
    .join("");

  const html = `
    <p>Thanks for your purchase from Bryt Vision Media!</p>
    <p>Your highlight clip${params.clips.length > 1 ? "s are" : " is"} ready to download here:</p>
    <p><a href="${orderUrl}">${orderUrl}</a></p>
    <ul>${clipLines}</ul>
    <p><strong>Download access expires ${expiresLabel}.</strong>
       After that, the file${params.clips.length > 1 ? "s" : ""} will no longer be available —
       please download promptly.</p>
  `;

  const { error } = await resend.emails.send({
    from: requireEmailFrom(),
    to: params.to,
    subject: "Your Bryt Vision Media highlight clips are ready",
    html,
  });

  if (error) {
    throw new Error(`Failed to send order confirmation email: ${error.message}`);
  }
}
