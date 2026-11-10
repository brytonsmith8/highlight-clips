import "server-only";

import { CLIP_ORIGINALS_BUCKET } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";

/** Finished edits live in the same PRIVATE bucket as clip originals, under edits/<session id>/. */
export const EDIT_DELIVERY_DAYS = 30;

const SESSION_ID = /^cs_(live|test)_[A-Za-z0-9]+$/;

export function isValidSessionId(id: string): boolean {
  return SESSION_ID.test(id);
}

export function editDeliveryPrefix(sessionId: string): string {
  return `edits/${sessionId}/`;
}

/** The path must be inside this order's own folder (stops one order's file being attached to another). */
export function isOwnEditPath(sessionId: string, path: string): boolean {
  return isValidSessionId(sessionId) && path.startsWith(editDeliveryPrefix(sessionId)) && !path.includes("..");
}

export function isEditDeliveryExpired(deliveredAt: string | null, now = Date.now()): boolean {
  if (!deliveredAt) return false;
  return now - new Date(deliveredAt).getTime() > EDIT_DELIVERY_DAYS * 86_400_000;
}

export async function createEditUploadTarget(sessionId: string, ext: string) {
  if (!isValidSessionId(sessionId)) throw new Error("Invalid order.");
  const safeExt = ["mp4", "mov", "m4v"].includes(ext.toLowerCase()) ? ext.toLowerCase() : "mp4";
  const path = `${editDeliveryPrefix(sessionId)}bryt-vision-edit-${Date.now()}.${safeExt}`;
  const { data, error } = await createServiceClient()
    .storage.from(CLIP_ORIGINALS_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new Error(`Could not start upload: ${error?.message}`);
  return { bucket: CLIP_ORIGINALS_BUCKET, path, token: data.token };
}

export async function editDeliveryExists(path: string): Promise<boolean> {
  const { data, error } = await createServiceClient().storage.from(CLIP_ORIGINALS_BUCKET).info(path);
  return !error && !!data;
}

export async function signedEditDownloadUrl(path: string): Promise<string | null> {
  const { data, error } = await createServiceClient()
    .storage.from(CLIP_ORIGINALS_BUCKET)
    .createSignedUrl(path, 60, { download: "bryt-vision-edit.mp4" });
  return error || !data?.signedUrl ? null : data.signedUrl;
}
