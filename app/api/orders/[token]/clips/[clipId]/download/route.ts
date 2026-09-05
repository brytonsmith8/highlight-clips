import { NextResponse } from "next/server";

import { getPurchaseForTokenAndClip, isDownloadExpired } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase/service";

interface DownloadRouteParams {
  params: Promise<{ token: string; clipId: string }>;
}

/**
 * Gated download: re-verifies the purchase (token + clip) and the download
 * window on every request before ever reading `full_url`. `full_url` is
 * never present in any page's HTML/JSON — this redirect is the only path
 * to it.
 */
export async function GET(_request: Request, { params }: DownloadRouteParams) {
  const { token, clipId } = await params;

  const purchase = await getPurchaseForTokenAndClip(token, clipId);
  if (!purchase) {
    return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  }
  if (isDownloadExpired(purchase.purchased_at)) {
    return NextResponse.json(
      { error: "Download window has expired." },
      { status: 410 },
    );
  }

  const supabase = createServiceClient();
  const { data: clip, error } = await supabase
    .from("clips")
    .select("full_url")
    .eq("id", clipId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!clip?.full_url) {
    return NextResponse.json({ error: "Original file unavailable." }, { status: 404 });
  }

  return NextResponse.redirect(clip.full_url);
}
