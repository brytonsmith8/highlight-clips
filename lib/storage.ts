import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/** Private bucket holding clip original (full-quality) files. */
export const CLIP_ORIGINALS_BUCKET = "clip-originals";

/** Public bucket holding low-quality preview files (meant to be watched freely). */
export const CLIP_PREVIEWS_BUCKET = "clip-previews";

/** How long a download signed-URL stays valid. */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Resolve a clip's `full_url` to something the browser can download from:
 *
 * - a full `http(s)://` URL is returned as-is (external / legacy files)
 * - anything else is treated as an object key in the private
 *   `clip-originals` bucket, and a short-lived signed URL is minted for it
 *
 * The signed URL expires in {@link SIGNED_URL_TTL_SECONDS} seconds, so a
 * captured redirect link dies almost immediately — the object itself is
 * never publicly reachable.
 */
export async function resolveClipDownloadUrl(
  fullUrl: string,
): Promise<string | null> {
  if (/^https?:\/\//i.test(fullUrl)) {
    return fullUrl;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(CLIP_ORIGINALS_BUCKET)
    // `download: true` sets Content-Disposition: attachment so the browser
    // saves the file rather than navigating to / playing it.
    .createSignedUrl(fullUrl, SIGNED_URL_TTL_SECONDS, { download: true });

  if (error || !data?.signedUrl) {
    console.error("[storage] createSignedUrl failed:", error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Upload a clip's original video; returns the object key to store in `full_url`. */
export async function uploadClipOriginal(
  clipId: string,
  file: File,
): Promise<string> {
  const supabase = createServiceClient();
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const key = `${clipId}.${ext}`;

  const { error } = await supabase.storage
    .from(CLIP_ORIGINALS_BUCKET)
    .upload(key, file, {
      contentType: file.type || "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload original file: ${error.message}`);
  }
  return key;
}

/** Best-effort delete of a clip original (used to roll back a failed insert). */
export async function deleteClipOriginal(key: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.storage.from(CLIP_ORIGINALS_BUCKET).remove([key]);
}

/**
 * Upload a clip's low-quality preview to the public previews bucket; returns
 * the public URL to store in `clips.preview_url` (played directly by the card).
 */
export async function uploadClipPreview(
  clipId: string,
  file: File,
): Promise<string> {
  const supabase = createServiceClient();
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const key = `${clipId}.${ext}`;

  const { error } = await supabase.storage
    .from(CLIP_PREVIEWS_BUCKET)
    .upload(key, file, {
      contentType: file.type || "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload preview file: ${error.message}`);
  }

  return supabase.storage.from(CLIP_PREVIEWS_BUCKET).getPublicUrl(key).data
    .publicUrl;
}

/** Best-effort delete of a clip preview (used to roll back a failed insert). */
export async function deleteClipPreview(key: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.storage.from(CLIP_PREVIEWS_BUCKET).remove([key]);
}
