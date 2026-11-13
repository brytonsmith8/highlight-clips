"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { setEditOrderStatus, setEditTrack, setShirtFulfillment } from "@/lib/edit-orders";

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

/** Edit track: Awaiting Edit / Editing in Progress / Edit Completed / Delivered to Customer, plus internal notes. */
export async function setEditTrackAction(formData: FormData) {
  await requireAdmin();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Missing order.");
  const result = await setEditTrack(sessionId, String(formData.get("editStatus") ?? ""), String(formData.get("notes") ?? ""));
  if (!result.ok) throw new Error(result.message);
  revalidatePath("/admin/orders");
  revalidatePath(`/order/${sessionId}`);
}

/** Shirt track: Awaiting / Preparing / Shipped / Delivered, with carrier + tracking and an optional customer email. */
export async function setShirtFulfillmentAction(formData: FormData) {
  await requireAdmin();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Missing order.");
  const result = await setShirtFulfillment(sessionId, {
    status: String(formData.get("shirtStatus") ?? ""),
    carrier: String(formData.get("carrier") ?? ""),
    tracking: String(formData.get("tracking") ?? ""),
    emailCustomer: formData.get("emailCustomer") === "on",
    markEmailed: formData.get("markEmailed") === "on",
  });
  if (!result.ok) throw new Error(result.message);
  revalidatePath("/admin/orders");
  revalidatePath(`/order/${sessionId}`);
}
