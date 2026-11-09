import { NextResponse } from "next/server";

import { isEditDeliveryExpired, isValidSessionId, signedEditDownloadUrl } from "@/lib/edit-delivery";
import { getEditDelivery, recordEditDownload } from "@/lib/edit-orders";
import { accessMessage, getOrderAccess } from "@/lib/order-access";

interface Params {
  params: Promise<{ token: string }>;
}

/** Gated download of the finished BRYT VISION EDIT: paid order + delivered file + window, then a 60 s signed URL. */
export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  if (!isValidSessionId(token)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const access = await getOrderAccess(token);
  if (!access.allowed) {
    return NextResponse.json(
      { error: accessMessage(access.reason) },
      { status: access.reason === "unavailable" ? 503 : 403 },
    );
  }
  const d = await getEditDelivery(token);
  if (!d) return NextResponse.json({ error: "Your edit is not ready yet." }, { status: 404 });
  if (isEditDeliveryExpired(d.deliveredAt)) {
    return NextResponse.json({ error: "Download window has expired. Contact us for help." }, { status: 410 });
  }
  const url = await signedEditDownloadUrl(d.path);
  if (!url) return NextResponse.json({ error: "File unavailable." }, { status: 404 });
  await recordEditDownload(token);
  return NextResponse.redirect(url);
}
