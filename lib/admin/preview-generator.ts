/**
 * Browser-only preview generator (admin only). No extra libraries, no uploads.
 *
 * "Method C", the recording method that passed every check in Safari on a Mac:
 *   1. Warm up: play the original briefly, pause, rewind to 0.
 *   2. Play again and WAIT until a picture has actually been shown.
 *   3. Only then start the browser's MediaRecorder, so the file has no lead-in.
 * Every frame is drawn onto a 480p canvas with the BRYT VISION mark centered
 * at 35% strength, and the original's sound is recorded with it.
 *
 * MP4 (H.264 + AAC) only. If the browser cannot record that, we stop with a
 * clear message; we never upload WebM or rename a file.
 *
 * Recording runs in real time (a 60 s clip takes about 60 s) and the tab must
 * stay visible. Nothing is uploaded here; the form shows the result first.
 */

import { inspectMp4 } from "@/lib/mp4-inspect";

const WATERMARK_PATH = "/brand/bryt-vision-logo.png";

/** Keep in step with PREVIEW_MAX_BYTES in lib/storage.ts (the server enforces it too). */
export const PREVIEW_MAX_BYTES = 25 * 1024 * 1024;
export const PREVIEW_HEIGHT = 480;

const VIDEO_BITS_PER_SECOND = 1_100_000;
const AUDIO_BITS_PER_SECOND = 96_000;
const WATERMARK_WIDTH = 200;
const WATERMARK_OPACITY = 0.35;
/** Plan to use at most 90% of the 25 MiB limit; real encoders overshoot their target a little. */
const SIZE_SAFETY = 0.9;
/** No new picture for this long means playback is stuck. */
const STALL_MS = 8000;
/** Largest gap (seconds) tolerated between preview and original length, and for track start times. */
const DURATION_TOLERANCE_S = 1.0;
const TRACK_START_TOLERANCE_S = 0.3;
/** Fewer pictures per second than this means the browser throttled the page (covered window, hidden pane). */
const MIN_FRAMES_PER_SECOND = 15;

/** Only H.264 + AAC in MP4 is accepted. Plain "video/mp4" is NOT used: it can contain VP9/Opus. */
const MP4_RECORDER_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
];

export interface GeneratedPreview {
  blob: Blob;
  width: number;
  height: number;
  durationSeconds: number;
  /** Plain-language results of the automatic checks that passed. */
  checks: string[];
  /** Things the admin must look at closely before approving (never blocking). */
  warnings: string[];
}

/** Thrown when the admin presses Cancel. */
export class PreviewCancelled extends Error {
  constructor() {
    super("Preview cancelled.");
    this.name = "PreviewCancelled";
  }
}

/** The H.264/AAC MP4 type this browser can record, or null (never a WebM fallback). */
export function pickMp4RecorderType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MP4_RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Longest original (seconds) whose preview is expected to fit the 25 MiB limit. */
export function maxPreviewSeconds(): number {
  return Math.floor(
    (PREVIEW_MAX_BYTES * SIZE_SAFETY * 8) / (VIDEO_BITS_PER_SECOND + AUDIO_BITS_PER_SECOND),
  );
}

/**
 * Phones and tablets are not supported for preview making: iPhone Safari refuses
 * scripted playback and frame capture, so the checks below cannot run there.
 * Returns the reason to show the admin, or null when this browser may proceed.
 */
export function previewUnsupportedReason(): string | null {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPad posing as a Mac
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) {
    return "Previews cannot be made on an iPhone or iPad. Open this page on a Mac and use Safari or Google Chrome.";
  }
  if (pickMp4RecorderType() === null) {
    return "This browser cannot record an H.264/AAC MP4 preview. Use Safari or Google Chrome on a Mac.";
  }
  return null;
}

/**
 * Create the audio engine INSIDE the click/submit handler, before any `await`.
 * Safari only lets sound start from a real tap; creating it later can hang.
 * generateWatermarkedPreview closes it when it finishes.
 */
export function createPreviewAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Ctor();
  void context.resume().catch(() => undefined);
  return context;
}

// ---------------------------------------------------------------- small helpers

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function nextFrame(video: HTMLVideoElement, timeoutMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    setTimeout(finish, timeoutMs);
    if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(() => finish());
    else requestAnimationFrame(() => finish());
  });
}

function seekTo(video: HTMLVideoElement, time: number, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const onSeeked = () => finish(true);
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    video.addEventListener("seeked", onSeeked, { once: true });
    video.currentTime = time;
  });
}

/**
 * Seek, then wait until the browser says it has actually SHOWN the picture for that time.
 * The "seeked" event can fire while the old picture is still on screen, so reading right
 * after it can return a stale frame. Where the browser reports presented-frame times
 * (requestVideoFrameCallback) we wait for a frame within 0.25 s of the target. We never wait
 * for the picture to "look right": the caller judges the picture once, after this returns.
 * Returns whether the seek happened, and whether the shown frame time was confirmed.
 */
function seekAndPresent(
  video: HTMLVideoElement,
  time: number,
  timeoutMs = 4000,
): Promise<{ seeked: boolean; confirmed: boolean }> {
  return new Promise((resolve) => {
    const hasCallback = "requestVideoFrameCallback" in video;
    let seeked = false;
    let confirmed = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve({ seeked, confirmed });
    };
    const onSeeked = () => {
      seeked = true;
      if (!hasCallback) setTimeout(finish, 600); // old browser: fixed settle time, cannot confirm
      else if (confirmed) finish();
    };
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (done) return;
      if (Math.abs(meta.mediaTime - time) <= 0.25) {
        confirmed = true;
        if (seeked) finish();
        return;
      }
      video.requestVideoFrameCallback(onFrame);
    };
    const timer = setTimeout(finish, timeoutMs);
    video.addEventListener("seeked", onSeeked, { once: true });
    if (hasCallback) video.requestVideoFrameCallback(onFrame);
    video.currentTime = time;
  });
}

function makeVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.preload = "auto";
  // Kept in the page (but invisible) because Safari is unreliable with detached video.
  video.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(video);
  return video;
}

/** Resolves when `video` (whose src is already set) knows its size and length. */
function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 1) return resolve();
    const timer = setTimeout(() => reject(new Error("Timed out reading the video.")), 15000);
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(new Error("This browser could not read that video file."));
    };
  });
}

/** Some files report an unknown length until the end has been visited. */
async function settleDuration(video: HTMLVideoElement): Promise<void> {
  if (video.duration !== Infinity) return;
  await seekTo(video, 1e101, 4000);
  await seekTo(video, 0, 4000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the logo image."));
    image.src = src;
  });
}

/** The brand file is white lettering on an opaque black square; make black see-through. */
async function makeWatermark(): Promise<HTMLCanvasElement> {
  const image = await loadImage(WATERMARK_PATH);
  const height = Math.round((WATERMARK_WIDTH * image.naturalHeight) / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = WATERMARK_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the preview.");
  ctx.drawImage(image, 0, 0, WATERMARK_WIDTH, height);
  const pixels = ctx.getImageData(0, 0, WATERMARK_WIDTH, height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const strength = Math.max(data[i], data[i + 1], data[i + 2]);
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = strength;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function decodeAudio(buffer: ArrayBuffer): Promise<AudioBuffer> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Ctor();
  return new Promise<AudioBuffer>((resolve, reject) => {
    const promise = context.decodeAudioData(buffer, resolve, reject);
    if (promise && typeof promise.catch === "function") promise.catch(reject);
  }).finally(() => {
    void context.close().catch(() => undefined);
  });
}

// ---------------------------------------------------------------- the generator

export interface GenerateOptions {
  /** Test hook: receives the raw recording BEFORE validation, so a test page can inspect a file that fails. The admin form never sets this. */
  onRecorded?: (blob: Blob) => void;
  /** Diagnostic only: skip the phone/tablet refusal. The admin form never sets this. */
  allowTouchDevice?: boolean;
}

/**
 * Records the preview and validates it. Throws an Error with a plain-language
 * message on any problem (nothing is uploaded by this function), and
 * PreviewCancelled when `signal` is aborted. Always cleans up after itself.
 *
 * IMPORTANT: call this directly from the click/submit handler. Everything up to
 * the first `await` runs inside the admin's tap, which is when Safari allows the
 * video to start playing. The original is started once there ("primed"), so later
 * scripted play() calls on the same element are allowed.
 */
export async function generateWatermarkedPreview(
  original: File,
  audioContext: AudioContext,
  onStatus: (message: string) => void,
  signal?: AbortSignal,
  options: GenerateOptions = {},
): Promise<GeneratedPreview> {
  const unsupported = options.allowTouchDevice ? (pickMp4RecorderType() ? null : previewUnsupportedReason()) : previewUnsupportedReason();
  if (unsupported) {
    audioContext.close().catch(() => undefined);
    throw new Error(unsupported);
  }
  const mimeType = pickMp4RecorderType() as string;
  if (document.hidden) {
    audioContext.close().catch(() => undefined);
    throw new Error("Keep this tab visible while the preview is made, then try again.");
  }

  // Any interruption rejects this promise; every long wait below races against it.
  let fail: (error: Error) => void = () => undefined;
  const failure = new Promise<never>((_, reject) => {
    fail = reject;
  });
  failure.catch(() => undefined);
  const guard = <T>(promise: Promise<T>) => Promise.race([promise, failure]);
  const onAbort = () => fail(new PreviewCancelled());
  if (signal?.aborted) onAbort();
  signal?.addEventListener("abort", onAbort, { once: true });

  const urls: string[] = [];
  const video = makeVideo();
  const checker = makeVideo(); // shows the original's pictures during checks; never played
  checker.muted = true;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let stopWatching: (() => void) | null = null;
  const onVideoError = () => fail(new Error("The video stopped unexpectedly."));

  try {
    // ---- Runs inside the admin's tap (no await above this line has happened) ----
    const originalUrl = URL.createObjectURL(original);
    urls.push(originalUrl);
    // Route the original's sound into the recording only, BEFORE it can play aloud.
    const sound = audioContext.createMediaElementSource(video);
    const soundDestination = audioContext.createMediaStreamDestination();
    sound.connect(soundDestination);
    video.src = originalUrl;
    checker.src = originalUrl;
    const primed = video.play().then(
      () => true,
      () => false,
    );
    onStatus("Reading the video…");
    await guard(waitForMetadata(video));
    const primedOk = await guard(primed);
    video.pause();
    if (!primedOk) {
      throw new Error("Safari refused to start the video. Tap Make preview again (it must be a direct tap).");
    }
    await guard(waitForMetadata(checker));
    await guard(settleDuration(video));
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error("That file does not look like a playable video in this browser.");
    }
    const limit = maxPreviewSeconds();
    if (duration > limit) {
      throw new Error(
        `This clip is ${Math.round(duration)} s. Previews are limited to ${limit} s so they stay under 25 MB. Trim the clip or make a shorter one.`,
      );
    }

    const height = PREVIEW_HEIGHT;
    const width = Math.max(2, Math.round((video.videoWidth * height) / video.videoHeight / 2) * 2);
    const watermark = await guard(makeWatermark());
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("This browser cannot draw the preview.");
    ctx.imageSmoothingQuality = "high";
    const drawFrame = () => {
      ctx.globalAlpha = 1;
      ctx.drawImage(video, 0, 0, width, height);
      ctx.globalAlpha = WATERMARK_OPACITY;
      ctx.drawImage(watermark, (width - watermark.width) / 2, (height - watermark.height) / 2);
      ctx.globalAlpha = 1;
    };

    await guard(audioContext.resume().catch(() => undefined));
    stream = canvas.captureStream(30);
    soundDestination.stream.getAudioTracks().forEach((track) => stream?.addTrack(track));
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const recorderStopped = new Promise<void>((resolve) => {
      recorder!.onstop = () => resolve();
    });
    recorder.onerror = () => fail(new Error("The browser's recorder reported an error."));

    // --- Method C, step 1: warm up, rewind ---
    onStatus("Warming up…");
    try {
      await guard(video.play());
    } catch (error) {
      if (error instanceof PreviewCancelled) throw error;
      throw new Error("The browser would not restart the video after the first tap. Tap Make preview again.");
    }
    await guard(nextFrame(video));
    await guard(sleep(250));
    video.pause();
    if (!(await guard(seekTo(video, 0, 4000)))) {
      throw new Error("The browser could not rewind the video.");
    }
    await guard(nextFrame(video, 600));

    // Playback must stay healthy from here to the end.
    const ended = new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    let hiddenWhileRecording = false;
    let lastTime = video.currentTime;
    let lastProgressAt = performance.now();
    const onHidden = () => {
      if (document.hidden) {
        hiddenWhileRecording = true;
        fail(new Error("The tab was hidden while recording, so the preview is incomplete. Try again and keep it visible."));
      }
    };
    const onPause = () => {
      if (!video.ended) fail(new Error("Playback was interrupted (paused by the device or browser). Try again."));
    };
    const onContextState = () => {
      if (audioContext.state !== "running") {
        fail(new Error("The audio engine was interrupted (call, alarm or another app). Try again."));
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onVideoError);
    audioContext.addEventListener("statechange", onContextState);
    stopWatching = () => {
      document.removeEventListener("visibilitychange", onHidden);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onVideoError);
      audioContext.removeEventListener("statechange", onContextState);
    };
    const deadline = performance.now() + (duration + 25) * 1000;
    watchdog = setInterval(() => {
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastProgressAt = performance.now();
      } else if (!video.ended && performance.now() - lastProgressAt > STALL_MS) {
        fail(new Error("Playback stalled. Try again with the tab in front."));
      }
      if (performance.now() > deadline) fail(new Error("Recording took too long. Try again."));
    }, 1000);

    // --- Method C, step 2: play, wait for a real picture, THEN start recording ---
    try {
      await guard(video.play());
    } catch (error) {
      if (error instanceof PreviewCancelled) throw error;
      throw new Error("The browser would not start the video. Tap Make preview again.");
    }
    await guard(nextFrame(video));
    drawFrame();
    recorder.start();

    let framesDrawn = 0;
    const step = () => {
      if (video.ended || recorder?.state !== "recording") return;
      drawFrame();
      framesDrawn++;
      onStatus(`Recording preview… ${Math.round((video.currentTime / duration) * 100)}% (keep this tab open; Cancel stops it)`);
      if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };
    step();

    await guard(ended);
    drawFrame();
    recorder.stop();
    await guard(recorderStopped);
    if (hiddenWhileRecording) throw new Error("The tab was hidden while recording. Try again.");
    clearInterval(watchdog);
    watchdog = null;
    stopWatching();
    stopWatching = null;

    // ---------------------------------------------------------- validation
    onStatus("Checking the preview…");
    const blob = new Blob(chunks, { type: "video/mp4" });
    options.onRecorded?.(blob);
    const buffer = await guard(blob.arrayBuffer());
    const checks: string[] = [];
    const warnings: string[] = [];

    const facts = inspectMp4(buffer);
    if (!facts.isMp4) throw new Error("The recording is not an MP4 file, so it was not kept.");
    if (!facts.hasH264 || !facts.hasAac) {
      throw new Error("The recording is not H.264 video with AAC audio, so it was not kept.");
    }
    checks.push("Real MP4 with H.264 video and AAC audio");

    if (blob.size > PREVIEW_MAX_BYTES) {
      throw new Error(`The preview came out at ${(blob.size / 1048576).toFixed(1)} MB (limit 25 MB). Use a shorter clip.`);
    }
    if (blob.size >= original.size) {
      throw new Error("The preview is not smaller than the original, so it was not kept.");
    }
    checks.push(`Size ${(blob.size / 1048576).toFixed(1)} MB (limit 25 MB), smaller than the original`);

    const framesPerSecond = framesDrawn / duration;
    if (framesPerSecond < MIN_FRAMES_PER_SECOND) {
      throw new Error(
        `The preview came out choppy (${framesPerSecond.toFixed(0)} pictures per second). Keep this tab in front and the window uncovered while it records, then try again.`,
      );
    }
    checks.push(`Smooth: ${framesPerSecond.toFixed(0)} pictures per second`);

    if (facts.height !== PREVIEW_HEIGHT) {
      throw new Error(`The file header says ${facts.height ?? "unknown"} pixels tall, not ${PREVIEW_HEIGHT}.`);
    }
    for (const start of [facts.videoStart, facts.audioStart]) {
      if (start !== null && start > TRACK_START_TOLERANCE_S) {
        throw new Error(`A track in the preview starts ${start.toFixed(1)} s late (a browser timing fault), so it was not kept.`);
      }
    }
    if (facts.hasEmptyEdit) {
      throw new Error("The preview has an empty lead-in (a browser timing fault), so it was not kept.");
    }

    // The original element (already allowed to play) now shows the preview.
    const preview = video;
    video.onended = null;
    const previewUrl = URL.createObjectURL(blob);
    urls.push(previewUrl);
    preview.src = previewUrl;
    preview.load();
    await guard(waitForMetadata(preview));
    if (preview.videoHeight !== PREVIEW_HEIGHT) {
      throw new Error(`The player sees ${preview.videoWidth}×${preview.videoHeight}, not ${PREVIEW_HEIGHT}p.`);
    }
    checks.push(`Resolution ${preview.videoWidth}×${preview.videoHeight} (480p)`);
    if (!isFinite(preview.duration)) {
      throw new Error("The preview has no readable length, so seeking would not work. It was not kept.");
    }
    if (Math.abs(preview.duration - duration) > DURATION_TOLERANCE_S) {
      throw new Error(
        `The preview is ${preview.duration.toFixed(1)} s but the original is ${duration.toFixed(1)} s (a browser timing fault), so it was not kept.`,
      );
    }
    checks.push(`Length ${preview.duration.toFixed(1)} s matches the original (${duration.toFixed(1)} s)`);

    // Seeking must work, and the picture must match the original at the same time.
    const probe = document.createElement("canvas");
    probe.width = 32;
    probe.height = 18;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    if (!probeCtx) throw new Error("This browser cannot check the preview.");
    const gray = (source: HTMLVideoElement) => {
      probeCtx.drawImage(source, 0, 0, 32, 18);
      const data = probeCtx.getImageData(0, 0, 32, 18).data;
      const out: number[] = [];
      for (let i = 0; i < data.length; i += 4) out.push((data[i] + data[i + 1] + data[i + 2]) / 3);
      return out;
    };
    const targets = [0.25, 0.5, 0.75].map((f) => Math.min(preview.duration - 0.2, f * duration));
    let mismatches = 0;
    let compared = 0;
    for (const t of targets) {
      const shownPreview = await guard(seekAndPresent(preview, t));
      if (!shownPreview.seeked || Math.abs(preview.currentTime - t) > 0.35) {
        throw new Error("Seeking in the preview does not work in this browser, so it was not kept.");
      }
      const shownOriginal = await guard(seekAndPresent(checker, t));
      if (!shownOriginal.seeked) continue;
      // If the browser could not confirm which picture was on screen, a comparison would be unreliable: skip it.
      if (shownPreview.confirmed !== shownOriginal.confirmed) continue;
      const a = gray(preview);
      const b = gray(checker);
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
      compared++;
      if (diff / a.length > 45) mismatches++;
    }
    if (compared >= 2 && mismatches >= 2) {
      throw new Error("The pictures in the preview do not line up with the original (a browser timing fault), so it was not kept.");
    }
    checks.push(
      compared >= 2
        ? "Seeking works and the pictures line up with the original at 25%, 50% and 75%"
        : "Seeking works (picture comparison skipped: this browser could not confirm which pictures were on screen)",
    );

    // Watermark: compare the logo area with what the original looks like there.
    const midT = Math.min(preview.duration - 0.2, 0.5 * duration);
    if ((await seekAndPresent(preview, midT)).seeked && (await seekAndPresent(checker, midT)).seeked) {
      const makeCtx = () => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        return c.getContext("2d", { willReadFrequently: true })!;
      };
      const gotCtx = makeCtx();
      gotCtx.drawImage(preview, 0, 0, width, height);
      const plainCtx = makeCtx();
      plainCtx.drawImage(checker, 0, 0, width, height);
      const withCtx = makeCtx();
      withCtx.drawImage(checker, 0, 0, width, height);
      withCtx.globalAlpha = WATERMARK_OPACITY;
      withCtx.drawImage(watermark, (width - watermark.width) / 2, (height - watermark.height) / 2);
      const x = Math.round((width - watermark.width) / 2);
      const y = Math.round((height - watermark.height) / 2);
      const region = (c: CanvasRenderingContext2D) => c.getImageData(x, y, watermark.width, watermark.height).data;
      const got = region(gotCtx);
      const mae = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
        let s = 0;
        for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        return s / ((a.length / 4) * 3);
      };
      const withLogo = mae(got, region(withCtx));
      const withoutLogo = mae(got, region(plainCtx));
      if (withoutLogo - withLogo >= 0.5) checks.push("BRYT VISION mark detected in the middle of the picture");
      else warnings.push("Could not confirm the mark automatically (this scene may be too bright or flat there). Check the middle of the picture yourself before approving.");
    } else {
      warnings.push("Could not capture a frame to confirm the mark. Check the middle of the picture yourself before approving.");
    }

    // Sound: informational. A silent original gives a silent preview.
    try {
      const decoded = await guard(decodeAudio(buffer.slice(0)));
      const channel = decoded.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < channel.length; i += 7) sum += channel[i] * channel[i];
      const rms = Math.sqrt(sum / Math.max(1, channel.length / 7));
      if (rms < 0.002) warnings.push("The preview has no audible sound. If the original has sound, do not approve this preview.");
      else checks.push("Audio is present");
    } catch (error) {
      if (error instanceof PreviewCancelled) throw error;
      warnings.push("Could not decode the sound to check it. Play the preview and listen before approving.");
    }

    return { blob, width, height: PREVIEW_HEIGHT, durationSeconds: duration, checks, warnings };
  } finally {
    if (watchdog) clearInterval(watchdog);
    stopWatching?.();
    signal?.removeEventListener("abort", onAbort);
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      /* already stopped */
    }
    stream?.getTracks().forEach((track) => track.stop());
    for (const element of [video, checker]) {
      element.pause();
      element.removeAttribute("src");
      element.remove();
    }
    urls.forEach((url) => URL.revokeObjectURL(url));
    void audioContext.close().catch(() => undefined);
  }
}
