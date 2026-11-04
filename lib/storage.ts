import "server-only";

import { publicEnv } from "@/lib/env";
import { inspectMp4, type Mp4Facts } from "@/lib/mp4-inspect";
import { PREVIEW_MARK } from "@/lib/preview-mark";
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

/**
 * Create one-time signed upload URLs for a new clip's preview + original.
 * The preview is always an MP4 generated in the admin's browser from the
 * original, so its extension is fixed here and never chosen by the caller.
 */
export async function createClipUploadUrls(
  clipId: string,
  originalExt: string,
): Promise<ClipUploadUrls> {
  const supabase = createServiceClient();
  const previewPath = `${clipId}.mp4`;
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

/** Largest preview the server will accept (matches the planned bucket limit). */
export const PREVIEW_MAX_BYTES = 25 * 1024 * 1024;

export interface ClipObjectInfo {
  size: number | null;
  contentType: string | null;
}

/** Size and content type Storage recorded for `bucket/path`, or null if unreadable. */
export async function clipObjectInfo(
  bucket: string,
  path: string,
): Promise<ClipObjectInfo | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(bucket).info(path);
  if (error || !data) return null;
  return { size: data.size ?? null, contentType: data.contentType ?? null };
}

/**
 * True when the first bytes of the object look like an MP4 container
 * ("ftyp" box at offset 4, and not a QuickTime "qt  " brand). Reads only
 * 16 bytes from the public preview URL.
 */
export async function previewLooksLikeMp4(path: string): Promise<boolean> {
  try {
    const res = await fetch(clipPreviewPublicUrl(path), {
      headers: { Range: "bytes=0-15" },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const head = new Uint8Array(await res.arrayBuffer()).slice(0, 16);
    if (head.length < 12) return false;
    const text = (from: number, to: number) =>
      String.fromCharCode(...head.slice(from, to));
    return text(4, 8) === "ftyp" && text(8, 12) !== "qt  ";
  } catch {
    return false;
  }
}

/**
 * Facts read from the first 256 KB of the public preview's MP4 boxes:
 * H.264 + AAC sample entries, track start times, empty edits. Null when the
 * header cannot be read. Reads what the file claims; it decodes nothing.
 */
export async function previewMp4Facts(path: string): Promise<Mp4Facts | null> {
  try {
    const res = await fetch(clipPreviewPublicUrl(path), {
      headers: { Range: "bytes=0-262143" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return inspectMp4(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * True when the public preview carries the tag our FFmpeg preview maker writes (see lib/preview-mark.ts).
 * Reads only the first 256 KB (the MP4 index sits at the front). A missing, unreadable or untagged
 * preview returns false, so the safe answer is always "not protected".
 */
export async function previewHasProtectionMark(path: string): Promise<boolean> {
  try {
    const res = await fetch(clipPreviewPublicUrl(path), {
      headers: { Range: "bytes=0-262143" },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
    return text.includes(PREVIEW_MARK);
  } catch {
    return false;
  }
}

/** Tallest video a public preview may be: previews are deliberately small and blurred (360 x 640 portrait). */
export const PREVIEW_MAX_HEIGHT = 720;

/**
 * Reads the video track's pixel size from the MP4 header ("tkhd" boxes) in the
 * first 128 KB of the public preview. Previews are saved with the header at the
 * front (+faststart), so it is found there. Returns null if it can't be read.
 * NOTE: this reads what the file CLAIMS; it does not decode any pixels.
 */
export async function previewVideoSize(
  path: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(clipPreviewPublicUrl(path), {
      headers: { Range: "bytes=0-131071" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let best: { width: number; height: number } | null = null;
    for (let i = 4; i + 100 < bytes.length; i++) {
      // "tkhd" = 0x74 0x6b 0x68 0x64
      if (bytes[i] !== 0x74 || bytes[i + 1] !== 0x6b || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) {
        continue;
      }
      const version = bytes[i + 4];
      const sizeAt = i + 4 + 4 + (version === 1 ? 84 : 72); // after version/flags + fields
      if (sizeAt + 8 > bytes.length) continue;
      const width = view.getUint32(sizeAt) / 65536;
      const height = view.getUint32(sizeAt + 4) / 65536;
      if (height > 0 && (!best || height > best.height)) best = { width, height };
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Rules a public preview must satisfy relative to its original. Returns a
 * human-readable reason when it fails, or null when it passes.
 */
export function checkPreviewAgainstOriginal(
  preview: ClipObjectInfo | null,
  original: ClipObjectInfo | null,
): string | null {
  if (!preview || !original || preview.size == null || original.size == null) {
    return "Could not read the uploaded file details. Please try again.";
  }
  if (!/^video\/mp4$/i.test(preview.contentType ?? "")) {
    return "The preview must be an MP4 video.";
  }
  if (preview.size > PREVIEW_MAX_BYTES) {
    const mb = (preview.size / (1024 * 1024)).toFixed(1);
    return `The preview is ${mb} MB; the limit is 25 MB. Use a shorter clip.`;
  }
  if (preview.size >= original.size) {
    return "The preview must be smaller than the original.";
  }
  return null;
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

/**
 * The object key inside the public previews bucket for a stored `preview_url`,
 * or null if the URL isn't one of ours (external / placeholder). Inverse of
 * {@link clipPreviewPublicUrl}.
 */
export function clipPreviewObjectKeyFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${CLIP_PREVIEWS_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const key = url.slice(at + marker.length).split("?")[0];
  return key || null;
}

/**
 * Best-effort removal of a clip's stored files. Never throws — returns a short
 * per-file status string for the caller to surface. External `http(s)` URLs
 * (legacy / placeholder rows) are left alone.
 */
export async function removeClipFiles(clip: {
  preview_url: string | null;
  full_url: string | null;
}): Promise<string> {
  const supabase = createServiceClient();
  const parts: string[] = [];

  if (clip.full_url && !/^https?:\/\//i.test(clip.full_url)) {
    const { error } = await supabase.storage
      .from(CLIP_ORIGINALS_BUCKET)
      .remove([clip.full_url]);
    parts.push(error ? "original: FAILED" : "original: removed");
    if (error) console.error("[storage] removeClipFiles original:", error.message);
  } else {
    parts.push("original: skipped (external)");
  }

  const previewKey = clipPreviewObjectKeyFromUrl(clip.preview_url);
  if (previewKey) {
    const { error } = await supabase.storage
      .from(CLIP_PREVIEWS_BUCKET)
      .remove([previewKey]);
    parts.push(error ? "preview: FAILED" : "preview: removed");
    if (error) console.error("[storage] removeClipFiles preview:", error.message);
  } else {
    parts.push("preview: skipped (external)");
  }

  return parts.join(", ");
}
