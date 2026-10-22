import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { cleanupExpiredOriginals } from "@/lib/cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends exactly this). */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false; // not configured (or too weak) -> closed
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily cleanup of originals whose clip is retired and whose buyers' download windows are all over.
 * Add `?dry=1` to see what would be removed without removing anything.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) {
    return NextResponse.json({ error: "Cleanup is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const report = await cleanupExpiredOriginals({ dryRun });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    console.error("[cleanup] failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Cleanup failed." }, { status: 500 });
  }
}
