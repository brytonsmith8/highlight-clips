import "server-only";

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

/** Plain comparison is acceptable here: single shared password, no user table, low-value target. */
export function checkAdminPassword(candidate: string): boolean {
  return candidate === requireAdminPassword();
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
