"use client";

import { useRef, useState, type FormEvent } from "react";

import { discardClipUpload, finalizeClip, startClipUpload } from "@/app/admin/clips/actions";
import { createClient } from "@/lib/supabase/client";

export interface ClipFormOption {
  id: string;
  label: string;
}

/**
 * New-clip form. The admin picks ONLY the original video. It uploads straight from the browser to the PRIVATE
 * Supabase bucket (signed upload URL, so the bytes never hit a serverless function), then the server makes the
 * blurred, watermarked, low-quality public preview with FFmpeg (`/api/admin/clips/preview`) and the admin
 * reviews it. Only after approval is the clip saved (unpublished); Discard deletes both new files.
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
  const formRef = useRef<HTMLFormElement>(null);
  // A generated preview waiting for the admin to watch it and approve it.
  const [pending, setPending] = useState<{
    clipId: string;
    originalPath: string;
    previewPath: string;
    previewUrl: string;
    previewBytes: number;
    originalName: string;
    gameId: string;
    athleteId: string | null;
    price: number;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    const gameId = String(data.get("game_id") ?? "");
    const athleteId = String(data.get("athlete_id") ?? "") || null;
    const price = Number(data.get("price"));
    const originalFile = data.get("original_file");

    if (!gameId) return setStatus("Pick a game.");
    if (!Number.isFinite(price) || price < 0) return setStatus("Enter a valid price.");
    if (!(originalFile instanceof File) || originalFile.size === 0) {
      return setStatus("Choose an original file.");
    }

    setBusy(true);
    let started: Awaited<ReturnType<typeof startClipUpload>> | null = null;
    try {
      setStatus("Preparing upload…");
      started = await startClipUpload({ originalExt: originalFile.name.split(".").pop() ?? "mp4" });

      setStatus("Uploading original to private storage… (large files can take a while)");
      const uploaded = await createClient()
        .storage.from(started.original.bucket)
        .uploadToSignedUrl(started.original.path, started.original.token, originalFile, {
          contentType: originalFile.type || "video/mp4",
        });
      if (uploaded.error) throw new Error(`Original upload failed: ${uploaded.error.message}`);

      setStatus("Making the blurred, watermarked preview on the server… (up to a few minutes for a long clip)");
      const response = await fetch("/api/admin/clips/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clipId: started.clipId, originalPath: started.original.path }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        previewPath?: string;
        previewUrl?: string;
        bytes?: number;
      };
      if (!response.ok || !result.previewPath || !result.previewUrl) {
        throw new Error(result.error ?? "The server could not make a preview.");
      }

      setPending({
        clipId: started.clipId,
        originalPath: started.original.path,
        previewPath: result.previewPath,
        previewUrl: result.previewUrl,
        previewBytes: result.bytes ?? 0,
        originalName: originalFile.name,
        gameId,
        athleteId,
        price,
      });
      setStatus("Preview ready. Watch it below, then approve to save the clip.");
    } catch (error) {
      // Nothing was saved as a clip. Remove any file that did get uploaded.
      if (started) {
        await discardClipUpload({
          clipId: started.clipId,
          originalPath: started.original.path,
          previewPath: started.preview.path,
        }).catch(() => undefined);
      }
      setStatus(
        `${error instanceof Error ? error.message : "Something went wrong."} Nothing was saved.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!pending) return;
    setBusy(true);
    try {
      setStatus("Saving clip…");
      await finalizeClip({
        clipId: pending.clipId,
        gameId: pending.gameId,
        athleteId: pending.athleteId,
        price: pending.price,
        previewPath: pending.previewPath,
        originalPath: pending.originalPath,
      });
      setStatus("Clip created (unpublished). Reloading…");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function discard() {
    if (!pending) return;
    setBusy(true);
    try {
      await discardClipUpload({
        clipId: pending.clipId,
        originalPath: pending.originalPath,
        previewPath: pending.previewPath,
      });
      setPending(null);
      formRef.current?.reset();
      setStatus("Discarded. The uploaded files were removed and no clip was created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove the uploaded files.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
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
        Original video file (kept private; MP4 or MOV). A smoothly blurred, watermarked, low-quality preview is
        made from it automatically on the server. Keep this tab open until the preview appears.
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
        disabled={busy || pending !== null}
        className="rounded bg-accent px-3 py-2 font-medium text-white disabled:opacity-60"
      >
        {busy ? "Working…" : "Upload and make preview"}
      </button>
      {pending && (
        <div className="space-y-2 rounded border border-border p-3">
          <p className="text-sm font-medium">Review the public preview of {pending.originalName}</p>
          <video
            src={pending.previewUrl}
            controls
            playsInline
            className="max-h-96 w-full rounded bg-black"
          />
          <p className="text-sm text-muted">
            Preview file: {(pending.previewBytes / 1048576).toFixed(2)} MB. This is the file the public will see. It
            should look smoothly out of focus with the logo crisp in the middle and the audio playing. Your
            full-quality original is stored privately and is not shown here.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={approve}
              className="rounded bg-accent px-3 py-2 font-medium text-white disabled:opacity-60"
            >
              Looks right — save clip
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={discard}
              className="rounded border border-border px-3 py-2"
            >
              Discard
            </button>
          </div>
        </div>
      )}
      {status && <p className="text-sm text-muted">{status}</p>}
    </form>
  );
}
