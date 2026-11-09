import "server-only";

import { createHmac } from "node:crypto";

import { isMissingRelationError } from "@/lib/order-access";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Admin login throttling, stored in the private table `admin_login_attempts` (migration 0009).
 * Serverless functions share no memory, so the counter lives in the database. It keeps only a keyed HASH of the
 * visitor address (never the address itself and never any password).
 *
 * Policy: MAX_FAILURES wrong passwords within WINDOW_MS locks that address out for LOCK_MS. While locked the
 * password is not even checked. A correct login clears the record.
 *
 * If the table cannot be read or written, login still works (fail OPEN): the admin must never be locked out of
 * their own site by a database hiccup. The shared password is still protected by constant-time comparison and a
 * fixed delay after every wrong attempt.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;
export const FAILURE_DELAY_MS = 750;

export function clientHash(ip: string, secret = process.env.ADMIN_SESSION_SECRET ?? ""): string {
  return createHmac("sha256", secret).update(`admin-login|${ip}`).digest("hex");
}

/** First address in x-forwarded-for (set by Vercel), else x-real-ip, else a fixed bucket. */
export function clientIpFromHeaders(get: (name: string) => string | null): string {
  const fwd = get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || get("x-real-ip")?.trim() || "unknown";
}

export interface LoginGate {
  locked: boolean;
  retryAfterSeconds: number;
}

export async function checkLoginGate(hash: string, now = Date.now()): Promise<LoginGate> {
  try {
    const { data, error } = await createServiceClient()
      .from("admin_login_attempts")
      .select("locked_until")
      .eq("client_hash", hash)
      .maybeSingle();
    if (error) {
      if (!isMissingRelationError(error)) console.error("[admin login] attempt lookup failed:", error.message);
      return { locked: false, retryAfterSeconds: 0 };
    }
    const until = (data as { locked_until: string | null } | null)?.locked_until;
    const ms = until ? new Date(until).getTime() - now : 0;
    return ms > 0 ? { locked: true, retryAfterSeconds: Math.ceil(ms / 1000) } : { locked: false, retryAfterSeconds: 0 };
  } catch (e) {
    console.error("[admin login] attempt lookup threw:", e instanceof Error ? e.message : "error");
    return { locked: false, retryAfterSeconds: 0 };
  }
}

export async function recordLoginFailure(hash: string, now = Date.now()): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("admin_login_attempts")
      .select("failures, window_started_at, locked_until")
      .eq("client_hash", hash)
      .maybeSingle();
    if (error) {
      if (!isMissingRelationError(error)) console.error("[admin login] attempt read failed:", error.message);
      return;
    }
    const prev = data as { failures: number; window_started_at: string; locked_until: string | null } | null;
    const windowStart = prev ? new Date(prev.window_started_at).getTime() : now;
    const fresh = !prev || now - windowStart > WINDOW_MS || (prev.locked_until && new Date(prev.locked_until).getTime() <= now);
    const failures = fresh ? 1 : prev.failures + 1;
    const row = {
      client_hash: hash,
      failures: failures >= MAX_FAILURES ? 0 : failures,
      window_started_at: new Date(fresh ? now : windowStart).toISOString(),
      locked_until: failures >= MAX_FAILURES ? new Date(now + LOCK_MS).toISOString() : null,
    };
    const { error: writeError } = await supabase.from("admin_login_attempts").upsert(row, { onConflict: "client_hash" });
    if (writeError) console.error("[admin login] attempt write failed:", writeError.message);
  } catch (e) {
    console.error("[admin login] attempt write threw:", e instanceof Error ? e.message : "error");
  }
}

export async function clearLoginFailures(hash: string): Promise<void> {
  try {
    await createServiceClient().from("admin_login_attempts").delete().eq("client_hash", hash);
  } catch {
    /* best effort */
  }
}
