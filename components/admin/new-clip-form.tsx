"use client";

import { useState, type FormEvent } from "react";

import { finalizeClip, startClipUpload } from "@/app/admin/clips/actions";
import { createClient } from "@/lib/supabase/client";

export interface ClipFormOption {
  id: string;
  label: string;
}

/**
 * New-clip form. Same fields as before, but the two video files upload
 * directly from the browser to Supabase Storage (signed upload URLs) so the
 * bytes never hit a Vercel serverless function. Only small JSON goes through
 * the Server Actions (`startClipUpload`, then `finalizeClip`).
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const gameId = String(data.get("game_id") ?? "");
    const athleteId = String(data.get("athlete_id") ?? "") || null;
    const price = Number(data.get("price"));
    const previewFile = data.get("preview_file");
    const originalFile = data.get("original_file");

    if (!gameId) return setStatus("Pick a game.");
    if (!Number.isFinite(price) || price < 0) return setStatus("Enter a valid price.");
    if (!(previewFile instanceof File) || previewFile.size === 0) {
      return setStatus("Choose a preview file.");
    }
    if (!(originalFile instanceof File) || originalFile.size === 0) {
      return setStatus("Choose an original file.");
    }

    setBusy(true);
    try {
      setStatus("Preparing upload…");
      const targets = await startClipUpload({
        previewExt: previewFile.name.split(".").pop() ?? "mp4",
        originalExt: originalFile.name.split(".").pop() ?? "mp4",
      });

      const supabase = createClient();

      setStatus("Uploading preview…");
      const preview = await supabase.storage
        .from(targets.preview.bucket)
        .uploadToSignedUrl(targets.preview.path, targets.preview.token, previewFile, {
          contentType: previewFile.type || "video/mp4",
        });
      if (preview.error) {
        throw new Error(`Preview upload failed: ${preview.error.message}`);
      }

      setStatus("Uploading original… (large files can take a while)");
      const original = await supabase.storage
        .from(targets.original.bucket)
        .uploadToSignedUrl(targets.original.path, targets.original.token, originalFile, {
          contentType: originalFile.type || "video/mp4",
        });
      if (original.error) {
        throw new Error(`Original upload failed: ${original.error.message}`);
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
        Preview video file (low quality / watermarked — shown publicly)
        <input
          name="preview_file"
          type="file"
          accept="video/mp4,video/quicktime"
          required
          className="mt-1 w-full rounded border border-border px-3 py-2 text-foreground"
        />
      </label>
      <label className="block text-sm text-muted">
        Original video file (uploaded to private storage, never shown publicly)
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
        {busy ? "Working…" : "Create clip (unpublished)"}
      </button>
      {status && <p className="text-sm text-muted">{status}</p>}
    </form>
  );
}
