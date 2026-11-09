"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import {
  createEditUploadTarget,
  editDeliveryExists,
  isOwnEditPath,
} from "@/lib/edit-delivery";
import { setEditDelivery } from "@/lib/edit-orders";

export async function prepareEditUpload(sessionId: string, fileName: string) {
  await requireAdmin();
  return createEditUploadTarget(sessionId, fileName.split(".").pop() ?? "mp4");
}

export async function finalizeEditDelivery(sessionId: string, path: string) {
  await requireAdmin();
  if (!isOwnEditPath(sessionId, path)) throw new Error("Invalid file for this order.");
  if (!(await editDeliveryExists(path))) throw new Error("The upload did not arrive. Try again.");
  const r = await setEditDelivery(sessionId, path);
  if (!r.ok) throw new Error(r.message);
  revalidatePath("/admin/orders");
  revalidatePath(`/order/${sessionId}`);
}
