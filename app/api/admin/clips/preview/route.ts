import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { isAdminRequest } from "@/lib/admin/auth";
import { resolveFfmpegPath } from "@/lib/admin/ffmpeg-path";
import { ffmpegVersionLine, generatePreviewFile } from "@/lib/admin/preview-ffmpeg";
import {
  CLIP_ORIGINALS_BUCKET,
  CLIP_PREVIEWS_BUCKET,
  clipPreviewPublicUrl,
  PREVIEW_MAX_BYTES,
} from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";

// FFmpeg needs the Node runtime and can take a while on a long clip.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Largest original this route will fetch into temporary disk space. */
const MAX_ORIGINAL_BYTES = 450 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Admin-only health check: confirms the FFmpeg program is present and runnable on this server, without
 * touching any file or storage. Open /api/admin/clips/preview while signed in to the admin.
 */
export async function GET() {
  if (!(await isAdminRequest())) return fail("Not authorized.", 401);
  try {
    return Response.json({ ok: true, ffmpeg: await ffmpegVersionLine(await resolveFfmpegPath()) });
  } catch (error) {
    console.error("[admin preview] health check failed:", error);
    return Response.json({ ok: false, error: "FFmpeg could not be run on this server." }, { status: 500 });
  }
}

/**
 * Step 2 of the admin upload: the browser has uploaded the original straight to the private bucket.
 * This reads it (read-only), makes the blurred, watermarked preview with FFmpeg, and stores ONLY the
 * preview, in the public previews bucket under the same clip id. The original is never modified.
 * Admin-only (the /admin route guard does not cover /api, so the session is checked here).
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest())) return fail("Not authorized.", 401);

  let body: { clipId?: unknown; originalPath?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Bad request.", 400);
  }
  const clipId = typeof body.clipId === "string" ? body.clipId : "";
  const originalPath = typeof body.originalPath === "string" ? body.originalPath : "";
  // Same path rules finalizeClip enforces: derived from the clip id, mp4/mov/m4v only.
  if (!UUID.test(clipId) || !new RegExp(`^${clipId}\\.(mp4|mov|m4v)$`, "i").test(originalPath)) {
    return fail("Unexpected upload paths.", 400);
  }
  const previewPath = `${clipId}.mp4`;

  const supabase = createServiceClient();
  const workDir = await mkdtemp(path.join(tmpdir(), "bryt-preview-"));
  try {
    const signed = await supabase.storage.from(CLIP_ORIGINALS_BUCKET).createSignedUrl(originalPath, 600);
    if (signed.error || !signed.data?.signedUrl) {
      return fail("The original upload was not found. Please try again.", 404);
    }

    // Copy the original to temporary disk (MP4 files often need random access, so they cannot be piped).
    const response = await fetch(signed.data.signedUrl);
    if (!response.ok || !response.body) return fail("Could not read the uploaded original.", 502);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_ORIGINAL_BYTES) {
      return fail("That original is too large to make a preview from (limit 450 MB).", 413);
    }
    const inputPath = path.join(workDir, "original");
    let received = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > MAX_ORIGINAL_BYTES) throw new Error("Original too large.");
        controller.enqueue(chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body.pipeThrough(counter) as never), createWriteStream(inputPath));

    const outputPath = path.join(workDir, "preview.mp4");
    const logoPath = path.join(process.cwd(), "public", "brand", "bryt-vision-logo.png");
    await generatePreviewFile({ ffmpegPath: await resolveFfmpegPath(), inputPath, logoPath, outputPath });

    const { size } = await stat(outputPath);
    if (size > PREVIEW_MAX_BYTES) {
      return fail("The preview came out larger than 25 MB. Use a shorter clip.", 413);
    }
    const bytes = await readFile(outputPath);
    const uploaded = await supabase.storage
      .from(CLIP_PREVIEWS_BUCKET)
      .upload(previewPath, bytes, { contentType: "video/mp4", upsert: true });
    if (uploaded.error) return fail("Could not store the preview. Please try again.", 502);

    return Response.json({ previewPath, previewUrl: clipPreviewPublicUrl(previewPath), bytes: size });
  } catch (error) {
    console.error("[admin preview] failed:", error);
    return fail(
      error instanceof Error && !/ENOENT|spawn|\/tmp|EACCES/i.test(error.message)
        ? error.message
        : "The server could not make a preview. Please try again.",
      500,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
