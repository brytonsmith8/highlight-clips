"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import {
  deleteOrderByToken,
  resetDownloadWindow,
  type MutationResult,
} from "@/lib/admin/mutations";
import { resendOrderConfirmationEmail } from "@/lib/orders";

export async function resendOrderEmailAction(
  formData: FormData,
): Promise<MutationResult> {
  await requireAdmin();
  const token = String(formData.get("token") ?? "");
  if (!token) return { ok: false, message: "Missing order token." };
  return resendOrderConfirmationEmail(token);
}

export async function extendOrderWindowAction(
  formData: FormData,
): Promise<MutationResult> {
  await requireAdmin();
  const token = String(formData.get("token") ?? "");
  if (!token) return { ok: false, message: "Missing order token." };

  const result = await resetDownloadWindow(token);
  if (result.ok) revalidatePath("/admin/orders");
  return result;
}

export async function deleteOrderAction(
  formData: FormData,
): Promise<MutationResult> {
  await requireAdmin();
  const token = String(formData.get("token") ?? "");
  if (!token) return { ok: false, message: "Missing order token." };

  const result = await deleteOrderByToken(token);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
