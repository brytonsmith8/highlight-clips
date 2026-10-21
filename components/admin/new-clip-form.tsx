"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { finalizeClip, startClipUpload } from "@/app/admin/clips/actions";
import {
  createPreviewAudioContext,
  generateWatermarkedPreview,
  maxPreviewSeconds,
  PreviewCancelled,
  previewUnsupportedReason,
  type GeneratedPreview,
} from "@/lib/admin/preview-generator";
import { createClient } from "@/lib/supabase/client";

export interface ClipFormOption {
  id: string;
  label: string;
}

/**
 * New-clip form. The admin picks ONLY the original video; the browser records
 * the watermarked 480p preview from it. Both files then upload directly from
 * the browser to Supabase Storage (signed upload URLs) so the bytes never hit
 * a serverless function. Only small JSON goes through the Server Actions
 * (`startClipUpload`, then `finalizeClip`, which re-checks the preview).
 */
export function NewClipForm({
  games,
  athletes,
}: {
  games: ClipFormOption[];
  athletes: ClipFormOption[];
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Held while a preview is being recorded, so Cancel can stop it.
  const recording = useRef<AbortController | null>(null);
  const [recordingNow, setRecordingNow] = useState(false);
  // A generated preview waiting for the admin to watch it and approve it.
  const [pending, setPending] = useState<{
    preview: GeneratedPreview;
    playbackUrl: string;
    original: File;
    gameId: string;
    athleteId: string | null;
    price: number;
  } | null>(null);

  // Release the playback URL when the pending preview is replaced or removed.
  useEffect(() => {
    return () => {
      if (pending) URL.revokeObjectURL(pending.playbackUrl);
    };
  }, [pending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const gameId = String(data.get("game_id") ?? "");
    const athleteId = String(data.get("athlete_id") ?? "") || null;
    const price = Number(data.get("price"));
    const originalFile = data.get("original_file");

    if (!gameId) return setStatus("Pick a game.");
    if (!Number.isFinite(price) || price < 0) return setStatus("Enter a valid price.");
    if (!(originalFile instanceof File) || originalFile.size === 0) {
      return setStatus("Choose an original file.");
    }

    const unsupported = previewUnsupportedReason();
    if (unsupported) return setStatus(unsupported);
    // Safari only allows video and sound to start from a real tap, so the audio
    // engine is created, and generateWatermarkedPreview called, before any await.
    const audioContext = createPreviewAudioContext();
    const controller = new AbortController();
    recording.current = controller;
    setRecordingNow(true);
    setBusy(true);
    try {
      // Step 1: make the public preview from the original and check it.
      // Nothing is uploaded until the admin has watched it and approved it.
      const preview = await generateWatermarkedPreview(
        originalFile,
        audioContext,
        setStatus,
        controller.signal,
      );
      setPending({
        preview,
        playbackUrl: URL.createObjectURL(preview.blob),
        original: originalFile,
        gameId,
        athleteId,
        price,
      });
      setStatus("Preview ready. Watch it below, then approve to upload.");
    } catch (error) {
      setStatus(
        error instanceof PreviewCancelled
          ? "Cancelled. Nothing was uploaded."
          : error instanceof Error
            ? `${error.message} Nothing was uploaded.`
            : "Something went wrong. Nothing was uploaded.",
      );
    } finally {
      recording.current = null;
      setRecordingNow(false);
      setBusy(false);
    }
  }

  async function approveAndUpload() {
    if (!pending) return;
    const { preview, original, gameId, athleteId, price } = pending;
    setBusy(true);
    try {
      setStatus("Preparing upload…");
      const targets = await startClipUpload({
        originalExt: original.name.split(".").pop() ?? "mp4",
      });

      const supabase = createClient();

      setStatus("Uploading preview…");
      const uploadedPreview = await supabase.storage
        .from(targets.preview.bucket)
        .uploadToSignedUrl(targets.preview.path, targets.preview.token, preview.blob, {
          contentType: "video/mp4",
        });
      if (uploadedPreview.error) {
        throw new Error(`Preview upload failed: ${uploadedPreview.error.message}`);
      }

      setStatus("Uploading original… (large files can take a while)");
      const uploadedOriginal = await supabase.storage
        .from(targets.original.bucket)
        .uploadToSignedUrl(targets.original.path, targets.original.token, original, {
          contentType: original.type || "video/mp4",
        });
      if (uploadedOriginal.error) {
        throw new Error(`Original upload failed: ${uploadedOriginal.error.message}`);
      }

      setStatus("Saving clip…");
      await finalizeClip({
        clipId: targets.clipId,
        gameId,
        athleteId,
        price,
        previewPath: targets.preview.path,
        originalPath: targets.original.path,
      });

      setStatus("Clip created (unpublished). Reloading…");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-3 rounded-lg border border-border p-4"
    >
      <h2 className="font-semibold">New clip</h2>
      <select
        name="game_id"
        required
        defaultValue=""
        className="w-full rounded border border-border px-3 py-2"
      >
        <option value="" disabled>
          Select game…
        </option>
        {games.map((game) => (
          <option key={game.id} value={game.id}>
            {game.label}
          </option>
        ))}
      </select>
      <select
        name="athlete_id"
        defaultValue=""
        className="w-full rounded border border-border px-3 py-2"
      >
        <option value="">No athlete</option>
        {athletes.map((athlete) => (
          <option key={athlete.id} value={athlete.id}>
            {athlete.label}
          </option>
        ))}
      </select>
      <input
        name="price"
        type="number"
        min="0"
        step="0.01"
        placeholder="Price (USD)"
        required
        className="w-full rounded border border-border px-3 py-2"
      />
      <label className="block text-sm text-muted">
        Original video file (kept private). A low-quality, watermarked preview is recorded from it automatically. This takes as long as the clip plays (up to {maxPreviewSeconds()} seconds), so keep this tab open and in front.
        <input
          name="original_file"
          type="file"
          accept="video/mp4,video/quicktime"
          required
          className="mt-1 w-full rounded border border-border px-3 py-2 text-foreground"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-accent px-3 py-2 font-medium text-white disabled:opacity-60"
      >
        {busy ? "Working…" : "Make preview"}
      </button>
      {recordingNow && (
        <button
          type="button"
          onClick={() => recording.current?.abort()}
          className="ml-2 rounded border border-border px-3 py-2"
        >
          Cancel
        </button>
      )}
      {pending && (
        <div className="space-y-2 rounded border border-border p-3">
          <p className="text-sm font-medium">Review the public preview</p>
          <video
            src={pending.playbackUrl}
            controls
            playsInline
            className="max-h-80 w-full rounded bg-black"
          />
          <ul className="list-disc pl-5 text-sm text-muted">
            {pending.preview.checks.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {pending.preview.warnings.map((line) => (
            <p key={line} className="text-sm font-medium text-red-600">
              {line}
            </p>
          ))}
          <p className="text-sm text-muted">
            Confirm the logo is visible in the middle and the audio plays. This
            exact file will be public.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={approveAndUpload}
              className="rounded bg-accent px-3 py-2 font-medium text-white disabled:opacity-60"
            >
              Looks right — upload preview and original
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPending(null);
                setStatus(null);
              }}
              className="rounded border border-border px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {status && <p className="text-sm text-muted">{status}</p>}
    </form>
  );
}
