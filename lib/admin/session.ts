import "server-only";

/**
 * Minimal signed-cookie session for the single shared admin password.
 *
 * No user table, no Supabase Auth — this is intentionally the simplest thing
 * that's still safe: a session token is `<expiryMs>.<base64url HMAC-SHA256
 * signature over expiryMs>`, signed with ADMIN_SESSION_SECRET. Forging a
 * token requires the secret; tampering with the expiry invalidates the
 * signature. Uses Web Crypto (`crypto.subtle`) so it works identically in
 * `proxy.ts` (edge runtime) and Server Actions (node runtime).
 */

const SESSION_COOKIE_NAME = "admin_session";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

function requireSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.trim() === "") {
    throw new Error(
      "Missing required environment variable: ADMIN_SESSION_SECRET.",
    );
  }
  return secret;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  // Uint8Array.from(...) (rather than `new Uint8Array(buffer)`) guarantees a
  // plain ArrayBuffer backing, satisfying BufferSource for crypto.subtle.
  return Uint8Array.from(Buffer.from(padded, "base64"));
}

export async function createSessionToken(): Promise<string> {
  const secret = requireSessionSecret();
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(expiresAt)),
  );
  return `${expiresAt}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;

  const [expiresAtRaw, signatureB64] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!expiresAtRaw || !signatureB64 || Number.isNaN(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;

  const secret = requireSessionSecret();
  const key = await hmacKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signatureB64),
    new TextEncoder().encode(String(expiresAt)),
  );
}

export { SESSION_COOKIE_NAME, SESSION_DURATION_MS };
