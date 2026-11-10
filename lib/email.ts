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
  /** Present only for orders that include the BRYT VISION EDIT + FREE SHIRT add-on. */
  edit?: { size: string; color: string; sleeve?: string | null; athleteLabel?: string | null };
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

  const editBlock = params.edit
    ? `
    <div style="margin:24px 0;padding:20px;background:#000000;border:2px solid #dc2626;border-radius:12px;color:#ffffff;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:bold;letter-spacing:1px;">YOUR BRYT VISION EDIT + <span style="color:#ef4444;">FREE SHIRT</span> IS CONFIRMED</p>
      ${params.edit.athleteLabel ? `<p style="margin:0 0 8px;">Athlete: ${escapeEmailHtml(params.edit.athleteLabel)}</p>` : ""}
      <p style="margin:0 0 8px;">Free one-sleeve compression shirt: ${escapeEmailHtml(params.edit.color)}, size ${escapeEmailHtml(params.edit.size)}${params.edit.sleeve ? `, ${escapeEmailHtml(params.edit.sleeve)} sleeve` : ""}.</p>
      <p style="margin:0 0 8px;"><strong>What happens next:</strong> we edit your highlight video (about 5&ndash;7 days, sometimes sooner), then ship your shirt to the address you entered at checkout. We will email you when your finished edit is ready &mdash; you can also check your order page anytime.</p>
      <p style="margin:0;">The clips you picked are listed below and are yours to download right now.</p>
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
    ${editBlock}
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

/** Sent once, when the finished BRYT VISION EDIT video has been uploaded and is ready to download. */
export async function sendEditReadyEmail(params: {
  to: string;
  token: string;
  athleteLabel?: string | null;
}): Promise<void> {
  const resend = new Resend(requireResendApiKey());
  const orderUrl = `${publicEnv.siteUrl}/order/${params.token}`;
  const html = `
    <h2 style="margin:0 0 12px;">YOUR BRYT VISION EDIT IS READY</h2>
    <p>${params.athleteLabel ? `The highlight video for ${escapeEmailHtml(params.athleteLabel)} is` : "Your highlight video is"} finished and ready to download.</p>
    <p><a href="${orderUrl}">Open your order page to download it</a></p>
    <p>The download is available for 30 days, so please save it soon.</p>
    <p><strong>ALL FOR THE GLORY OF GOD.</strong></p>
  `;
  const { error } = await resend.emails.send({
    from: requireEmailFrom(),
    to: params.to,
    subject: "Your BRYT VISION EDIT is ready to download",
    html,
  });
  if (error) throw new Error(`Failed to send edit-ready email: ${error.message}`);
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

/** Tells the customer their free BRYT VISION shirt is on its way, with carrier and tracking number. */
export async function sendShirtShippedEmail(params: {
  to: string;
  token: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  athleteLabel?: string | null;
}): Promise<void> {
  const resend = new Resend(requireResendApiKey());
  const orderUrl = `${publicEnv.siteUrl}/order/${params.token}`;
  const carrier = escapeEmailHtml(params.carrier);
  const number = escapeEmailHtml(params.trackingNumber);
  const html = `
    <h2 style="margin:0 0 12px;">YOUR FREE BRYT VISION SHIRT HAS SHIPPED</h2>
    <p>${params.athleteLabel ? `The shirt for ${escapeEmailHtml(params.athleteLabel)} is` : "Your shirt is"} on its way.
       It came <strong>included with your BRYT VISION EDIT</strong>, so there is no extra charge.</p>
    <p><strong>Carrier:</strong> ${carrier}<br/><strong>Tracking number:</strong> ${number}</p>
    ${params.trackingUrl ? `<p><a href="${params.trackingUrl}">Track your package</a></p>` : ""}
    <p><a href="${orderUrl}">View your order</a></p>
    <p><strong>ALL FOR THE GLORY OF GOD.</strong></p>
  `;
  const { error } = await resend.emails.send({
    from: requireEmailFrom(),
    to: params.to,
    subject: "Your free BRYT VISION shirt has shipped",
    html,
  });
  if (error) throw new Error(`Failed to send shirt-shipped email: ${error.message}`);
}

/** Internal heads-up to the owner when a PAID BRYT VISION EDIT + FREE SHIRT order has been recorded. */
export async function sendAdminAddOnEmail(params: {
  to: string;
  orderNumber: string;
  customerName: string | null;
  athleteLabel: string | null;
  shirt: string;
  shipTo: string[];
  clipCount: number;
}): Promise<void> {
  const resend = new Resend(requireResendApiKey());
  const e = escapeEmailHtml;
  const html = `
    <h2 style="margin:0 0 12px;">New BRYT VISION EDIT order ${e(params.orderNumber)}</h2>
    <p><strong>Customer:</strong> ${e(params.customerName ?? "(no name)")}<br/>
       <strong>Athlete:</strong> ${e(params.athleteLabel ?? "(not set)")}<br/>
       <strong>Clips purchased:</strong> ${params.clipCount}<br/>
       <strong>Shirt:</strong> ${e(params.shirt)}</p>
    <p><strong>Ship to:</strong><br/>${params.shipTo.map((l) => e(l)).join("<br/>") || "(no address)"}</p>
    <p>Payment confirmed by Stripe. Open Admin &rarr; Orders to start the edit and the shirt.</p>
  `;
  const { error } = await resend.emails.send({
    from: requireEmailFrom(),
    to: params.to,
    subject: `New BRYT VISION EDIT order ${params.orderNumber}`,
    html,
  });
  if (error) throw new Error(`Failed to send admin add-on email: ${error.message}`);
}
