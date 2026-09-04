import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/admin/session";

/**
 * Route guard for /admin/**. Next 16 renamed `middleware.ts` to `proxy.ts`
 * (same runtime/behavior, new file/export name).
 *
 * This is the first line of defense; every admin Server Action also calls
 * `requireAdmin()` independently (lib/admin/auth.ts) rather than trusting
 * this alone.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifySessionToken(token);

  if (!valid) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
