"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { setEditOrderStatus } from "@/lib/edit-orders";

/** Move a BRYT VISION EDIT order through the fulfillment steps. Payment itself is never changed here. */
export async function setEditStatusAction(formData: FormData) {
  await requireAdmin();
  const sessionId = String(formData.get("sessionId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!sessionId) throw new Error("Missing order.");
  const result = await setEditOrderStatus(sessionId, status);
  if (!result.ok) throw new Error(result.message);
  revalidatePath("/admin/orders");
}
