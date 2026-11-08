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
  /** Optional: old call sites passed a per-clip price; bundle orders show the order total instead. */
  priceDollars?: number;
}

function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Sends the private order-link email after a successful checkout. */
export async function sendOrderConfirmationEmail(params: {
  to: string;
  token: string;
  clips: PurchasedClipSummary[];
  expiresAt: Date;
  /** The one Scripture saved with this order (KJV). */
  scripture?: { reference: string; text: string };
  totalDollars?: number;
}): Promise<void> {
  const resend = new Resend(requireResendApiKey());
  const orderUrl = `${publicEnv.siteUrl}/order/${params.token}`;
  const expiresLabel = params.expiresAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const clipLines = params.clips
    .map((c, i) => {
      const price = typeof c.priceDollars === "number" ? ` — $${c.priceDollars.toFixed(2)}` : "";
      return `<li>Highlight clip ${i + 1}: ${escapeEmailHtml(c.schoolA)} vs ${escapeEmailHtml(c.schoolB)}${price}</li>`;
    })
    .join("");
  const total =
    typeof params.totalDollars === "number"
      ? `<p><strong>Total paid: $${params.totalDollars.toFixed(2)}</strong></p>`
      : "";

  const scriptureBlock = params.scripture
    ? `
    <div style="margin:24px 0;padding:24px;background:#111827;border-radius:12px;text-align:center;">
      <p style="margin:0 0 12px;color:#fbbf24;font-size:12px;letter-spacing:2px;font-weight:bold;">A WORD OF ENCOURAGEMENT</p>
      <p style="margin:0;color:#ffffff;font-size:22px;line-height:1.4;font-weight:bold;">&ldquo;${escapeEmailHtml(params.scripture.text)}&rdquo;</p>
      <p style="margin:16px 0 0;color:#fbbf24;font-size:16px;font-weight:bold;">${escapeEmailHtml(params.scripture.reference)} (KJV)</p>
    </div>`
    : "";

  const html = `
    <h2 style="margin:0 0 12px;">THANK YOU FOR SUPPORTING BRYTVISION!</h2>
    <p>Your support means more than you know. BrytVision is built on faith, purpose, and the belief that the gifts and talents God has given us should be used for His glory.</p>
    <p>We hope you enjoy your purchase, celebrate your hard work, and continue pursuing the purpose God has placed on your life.</p>
    ${scriptureBlock}
    <p>Remember, your talent is a gift, but what you do with it is your opportunity to glorify the One who gave it to you.</p>
    <p>Thank you for being part of the BrytVision family. May God continue to bless you, guide your steps, and give you strength in everything you do.</p>
    <p><strong>ALL FOR THE GLORY OF GOD.</strong></p>
    <hr>
    <p>Your highlight clip${params.clips.length > 1 ? "s are" : " is"} ready to download here:</p>
    <p><a href="${orderUrl}">${orderUrl}</a></p>
    <ul>${clipLines}</ul>
    ${total}
    <p><strong>Download access expires ${expiresLabel}.</strong>
       After that, the file${params.clips.length > 1 ? "s" : ""} will no longer be available —
       please download promptly.</p>
  `;

  const { error } = await resend.emails.send({
    from: requireEmailFrom(),
    to: params.to,
    subject: "Thank you! Your Bryt Vision Media highlight clips are ready",
    html,
  });

  if (error) {
    throw new Error(`Failed to send order confirmation email: ${error.message}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface MerchEmailLine {
  description: string;
  quantity: number;
  totalDollars: number;
}

/** Sends the merch order confirmation (no download link — this is a shipped product). */
export async function sendMerchConfirmationEmail(params: {
  to: string;
  orderRef: string;
  lines: MerchEmailLine[];
  totalDollars: number;
  shippingLines: string[];
}): Promise<void> {
  const resend = new Resend(requireResendApiKey());
  const thanksUrl = `${publicEnv.siteUrl}/merch/thanks?session_id=${encodeURIComponent(params.orderRef)}`;

  const items = params.lines
    .map(
      (l) =>
        `<li>${escapeHtml(l.description)} &times; ${l.quantity} — $${l.totalDollars.toFixed(2)}</li>`,
    )
    .join("");
  const address = params.shippingLines.length
    ? `<p><strong>Shipping to:</strong><br>${params.shippingLines.map(escapeHtml).join("<br>")}</p>`
    : "";

  const html = `
    <p>Thank you for your BRYT VISION order! Your payment was received.</p>
    <ul>${items}</ul>
    <p><strong>Total paid: $${params.totalDollars.toFixed(2)}</strong></p>
    ${address}
    <p>You can view your order summary any time here:<br>
       <a href="${thanksUrl}">${thanksUrl}</a></p>
    <p>All for the glory of God.</p>
  `;

  const { error } = await resend.emails.send({
    from: requireEmailFrom(),
    to: params.to,
    subject: "Your BRYT VISION order is confirmed",
    html,
  });

  if (error) {
    throw new Error(`Failed to send merch confirmation email: ${error.message}`);
  }
}
