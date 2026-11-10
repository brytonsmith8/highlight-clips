import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/admin/session";

function requireAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.trim() === "") {
    throw new Error("Missing required environment variable: ADMIN_PASSWORD.");
  }
  return password;
}

/**
 * Constant-time comparison. Both sides are hashed to the same length first, so neither the content nor the
 * length of the real password can be learned from response timing.
 */
export function checkAdminPassword(candidate: string): boolean {
  const expected = createHash("sha256").update(requireAdminPassword()).digest();
  const given = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expected, given);
}

/** True if the current request carries a valid, unexpired admin session cookie. */
export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * Call at the top of every admin Server Action / Server Component that
 * mutates or reads privileged data. `proxy.ts` already blocks unauthenticated
 * requests to `/admin/**`, but Server Actions can be invoked directly, so
 * this is checked independently rather than trusted to the route guard alone.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminRequest())) {
    throw new Error("Not authorized.");
  }
}

/** Page-level equivalent of requireAdmin(): redirects to login instead of throwing. */
export async function requireAdminOrRedirect(): Promise<void> {
  if (!(await isAdminRequest())) {
    redirect("/admin/login");
  }
}
