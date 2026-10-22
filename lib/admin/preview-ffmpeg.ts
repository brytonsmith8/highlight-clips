import "server-only";

import { spawn } from "node:child_process";

/**
 * Server-side preview generation with FFmpeg.
 *
 * Why this exists: recording a preview in the admin's browser depends on that browser's video encoder
 * (Safari's failed with "EncodingError: Internal Error" and its H.264 output was blocky). FFmpeg's x264
 * encoder behaves the same everywhere, so the public preview is made here instead, from a copy of the
 * original that is read-only to this code. The original file is never modified.
 *
 * The preview is: ~352 px on the short side (sizes are multiples of 16), 12 frames per second, a smooth
 * Gaussian blur applied at that size, the BRYT VISION mark centered and crisp at 50% opacity AFTER the
 * blur, H.264 video + AAC audio in an MP4 with the index at the front (so seeking and streaming work).
 */

export const PREVIEW_SHORT_SIDE = 352;
export const PREVIEW_LONG_SIDE_MAX = 640;
export const PREVIEW_FPS = 12;
/** Gaussian blur strength in pixels at a 352 px short side. Larger = blurrier. */
export const PREVIEW_BLUR_SIGMA = 4;
/** Mark width as a fraction of the short side, and its opacity. */
export const WATERMARK_FRACTION = 0.7;
export const WATERMARK_OPACITY = 0.5;
/** Longest clip a preview is made from (keeps the file under the 25 MB preview limit and the job under its time limit). */
export const PREVIEW_MAX_SECONDS = 300;

const AUDIO_BITRATE = "64k";

export interface InputFacts {
  hasAudio: boolean;
  durationSeconds: number | null;
}

/** Read the input's audio presence and length from FFmpeg's own report (no separate ffprobe needed). */
export function parseInputFacts(report: string): InputFacts {
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(report);
  return {
    hasAudio: /Stream #\d+:\d+[^\n]*: Audio:/.test(report),
    durationSeconds: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null,
  };
}

/** The FFmpeg filter graph. Exported so tests can inspect it. */
export function buildFilterGraph(sigma: number = PREVIEW_BLUR_SIGMA): string {
  const short = PREVIEW_SHORT_SIDE;
  const long = PREVIEW_LONG_SIDE_MAX;
  // Sides snap to multiples of 16 (H.264 macroblocks); the long side is capped. Autorotate has already
  // applied the phone's rotation flag by the time this runs, so iw/ih are the picture as people see it.
  const width = `if(gte(iw,ih),min(${long},round(${short}*iw/ih/16)*16),${short})`;
  const height = `if(gte(iw,ih),${short},min(${long},round(${short}*ih/iw/16)*16))`;
  const mark = Math.round((short * WATERMARK_FRACTION) / 2) * 2;
  return [
    // 1. frame rate, then shrink (anamorphic pixels squared first), then the smooth blur at working size
    `[0:v]fps=${PREVIEW_FPS},scale=iw*sar:ih,scale=w='${width}':h='${height}':flags=lanczos,setsar=1,gblur=sigma=${sigma}:steps=3[bg]`,
    // 2. the logo -> a white mark whose see-through-ness comes from the logo's brightness, at 50% opacity
    `[1:v]scale=${mark}:-1,format=gray,split[g1][g2]`,
    `[g1]format=rgb24,lutrgb=r=255:g=255:b=255[white]`,
    `[white][g2]alphamerge,format=rgba,colorchannelmixer=aa=${WATERMARK_OPACITY}[mark]`,
    // 3. mark on top of the already-blurred picture, centered, so it stays sharp
    `[bg][mark]overlay=(W-w)/2:(H-h)/2:eof_action=repeat,format=yuv420p[v]`,
  ].join(";");
}

export interface PreviewArgsInput {
  inputPath: string;
  /** Length of the input, used to give a silent clip a silent track of the same length. */
  inputSeconds?: number | null;
  logoPath: string;
  outputPath: string;
  hasAudio: boolean;
}

export function buildPreviewArgs({ inputPath, logoPath, outputPath, hasAudio, inputSeconds }: PreviewArgsInput): string[] {
  const args = ["-hide_banner", "-nostdin", "-y", "-i", inputPath, "-i", logoPath];
  // A clip with no sound still gets a silent AAC track (the preview must be H.264 + AAC), the length of the clip.
  const silenceSeconds = Math.min(PREVIEW_MAX_SECONDS, inputSeconds ?? PREVIEW_MAX_SECONDS).toFixed(2);
  if (!hasAudio) args.push("-f", "lavfi", "-t", silenceSeconds, "-i", "anullsrc=r=44100:cl=stereo");
  args.push("-filter_complex", buildFilterGraph(), "-map", "[v]", "-map", hasAudio ? "0:a:0" : "2:a:0");
  args.push(
    "-t", String(PREVIEW_MAX_SECONDS),
    "-c:v", "libx264", "-preset", "faster", "-profile:v", "high", "-level", "3.1",
    "-crf", "22", "-maxrate", "600k", "-bufsize", "1200k", "-g", String(PREVIEW_FPS * 2), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", AUDIO_BITRATE, "-ar", "44100", "-ac", "2",
    "-movflags", "+faststart",
    outputPath,
  );
  return args;
}

interface RunResult {
  code: number | null;
  stderr: string;
  timedOut: boolean;
}

function run(ffmpegPath: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      // Keep only the tail: FFmpeg prints a progress line constantly.
      stderr = (stderr + chunk.toString()).slice(-20000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, timedOut });
    });
  });
}

export interface GenerateResult {
  hasAudio: boolean;
  inputSeconds: number | null;
}

/**
 * Make the preview file. Throws a plain-English Error on failure; the message never includes file paths or URLs.
 */
export async function generatePreviewFile(options: {
  ffmpegPath: string;
  inputPath: string;
  logoPath: string;
  outputPath: string;
  timeoutMs?: number;
}): Promise<GenerateResult> {
  const { ffmpegPath, inputPath, logoPath, outputPath, timeoutMs = 270_000 } = options;

  // FFmpeg prints the input's streams then exits with an error because no output was given: that is the probe.
  const probe = await run(ffmpegPath, ["-hide_banner", "-nostdin", "-i", inputPath], 30_000);
  if (!/Stream #\d+:\d+[^\n]*: Video:/.test(probe.stderr)) {
    throw new Error("That file does not look like a video the server can read.");
  }
  const facts = parseInputFacts(probe.stderr);
  if (facts.durationSeconds !== null && facts.durationSeconds > PREVIEW_MAX_SECONDS + 1) {
    throw new Error(
      `This clip is ${Math.round(facts.durationSeconds)} s. Previews are limited to ${PREVIEW_MAX_SECONDS} s. Trim the clip first.`,
    );
  }

  const result = await run(ffmpegPath, buildPreviewArgs({ inputPath, logoPath, outputPath, hasAudio: facts.hasAudio, inputSeconds: facts.durationSeconds }), timeoutMs);
  if (result.timedOut) throw new Error("Making the preview took too long. Try a shorter or smaller clip.");
  if (result.code !== 0) {
    console.error("[preview-ffmpeg] failed:", result.stderr.slice(-1500));
    throw new Error("The server could not make a preview from that video.");
  }
  return { hasAudio: facts.hasAudio, inputSeconds: facts.durationSeconds };
}

/** First line of `ffmpeg -version`, for the admin health check. Throws if the program cannot be run. */
export async function ffmpegVersionLine(ffmpegPath: string): Promise<string> {
  const result = await new Promise<{ code: number | null; out: string }>((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-hide_banner", "-version"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
  if (result.code !== 0) throw new Error("FFmpeg did not run.");
  return result.out.split("\n")[0] ?? "";
}
