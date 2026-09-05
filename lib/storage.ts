import "server-only";

import { publicEnv } from "@/lib/env";
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
  downloadFilename?: string,
): Promise<string | null> {
  if (/^https?:\/\//i.test(fullUrl)) {
    return fullUrl;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(CLIP_ORIGINALS_BUCKET)
    // An explicit filename gives Content-Disposition: attachment;
    // filename="…​.mp4" so every browser saves a properly-named .mp4
    // (players like QuickTime reject a file without a real extension).
    .createSignedUrl(fullUrl, SIGNED_URL_TTL_SECONDS, {
      download: downloadFilename ?? true,
    });

  if (error || !data?.signedUrl) {
    console.error("[storage] createSignedUrl failed:", error?.message);
    return null;
  }
  return data.signedUrl;
}

// ── Direct-to-storage upload for the admin clip form ────────────────────────
//
// Clip files (preview + original) are uploaded straight from the browser to
// Supabase Storage using one-time signed upload URLs, so the file bytes never
// pass through a Vercel serverless function (hard 4.5 MB request-body cap).

const ALLOWED_EXTS = new Set(["mp4", "mov", "m4v"]);

function normalizeExt(nameOrExt: string): string {
  const raw = nameOrExt.includes(".")
    ? nameOrExt.split(".").pop() ?? ""
    : nameOrExt;
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ALLOWED_EXTS.has(ext) ? ext : "mp4";
}

export interface ClipUploadTarget {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
}

export interface ClipUploadUrls {
  clipId: string;
  preview: ClipUploadTarget;
  original: ClipUploadTarget;
}

/** Create one-time signed upload URLs for a new clip's preview + original. */
export async function createClipUploadUrls(
  clipId: string,
  previewExt: string,
  originalExt: string,
): Promise<ClipUploadUrls> {
  const supabase = createServiceClient();
  const previewPath = `${clipId}.${normalizeExt(previewExt)}`;
  const originalPath = `${clipId}.${normalizeExt(originalExt)}`;

  const [prev, orig] = await Promise.all([
    supabase.storage
      .from(CLIP_PREVIEWS_BUCKET)
      .createSignedUploadUrl(previewPath, { upsert: true }),
    supabase.storage
      .from(CLIP_ORIGINALS_BUCKET)
      .createSignedUploadUrl(originalPath, { upsert: true }),
  ]);

  if (prev.error || !prev.data) {
    throw new Error(`Could not start preview upload: ${prev.error?.message}`);
  }
  if (orig.error || !orig.data) {
    throw new Error(`Could not start original upload: ${orig.error?.message}`);
  }

  return {
    clipId,
    preview: {
      bucket: CLIP_PREVIEWS_BUCKET,
      path: previewPath,
      token: prev.data.token,
      signedUrl: prev.data.signedUrl,
    },
    original: {
      bucket: CLIP_ORIGINALS_BUCKET,
      path: originalPath,
      token: orig.data.token,
      signedUrl: orig.data.signedUrl,
    },
  };
}

/** Public URL for an object in the public previews bucket. */
export function clipPreviewPublicUrl(path: string): string {
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/${CLIP_PREVIEWS_BUCKET}/${path}`;
}

/** Whether an object actually landed at `bucket/path`. */
export async function clipObjectExists(
  bucket: string,
  path: string,
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 10);
  return !error && Boolean(data?.signedUrl);
}

/** Best-effort delete of a clip original (used to roll back a failed insert). */
export async function deleteClipOriginal(key: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.storage.from(CLIP_ORIGINALS_BUCKET).remove([key]);
}

/** Best-effort delete of a clip preview (used to roll back a failed insert). */
export async function deleteClipPreview(key: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.storage.from(CLIP_PREVIEWS_BUCKET).remove([key]);
}
