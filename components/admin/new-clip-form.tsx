"use client";

import { useRef, useState, type FormEvent } from "react";

import { discardClipUpload, finalizeClip, startClipUpload } from "@/app/admin/clips/actions";
import { INDIVIDUAL_PRICE_CENTS } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";

export interface ClipFormGame {
  id: string;
  label: string;
  schools: string[];
}

interface QueueItem {
  file: File;
  school: string;
  jersey: string;
}

interface Pending {
  clipId: string;
  originalPath: string;
  previewPath: string;
  previewUrl: string;
  previewBytes: number;
  originalName: string;
  gameId: string;
  school: string;
  jersey: string;
}

const inputClass = "w-full rounded border border-border px-3 py-2";

/**
 * New-clips form. Pick the game once, choose one or MANY original videos, then give each clip its school and
 * jersey number. Each original uploads straight from the browser to the PRIVATE Supabase bucket, the server
 * makes the blurred, watermarked, low-quality public preview with FFmpeg, and you review that preview before the
 * clip is saved (unpublished). Clips are handled one at a time, in order. Price is fixed by the site
 * ($12.50 each, or the bundle price for 4+), so there is no price box.
 */
export function NewClipForm({ games }: { games: ClipFormGame[] }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gameId, setGameId] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The latest queue/game for async steps (state would be stale inside them).
  const live = useRef<{ queue: QueueItem[]; gameId: string }>({ queue: [], gameId: "" });

  const game = games.find((g) => g.id === gameId);
  const schools = game?.schools ?? [];

  function onGameChange(id: string) {
    setGameId(id);
    const g = games.find((x) => x.id === id);
    // Default each clip to the first school; the admin changes it per clip.
    setQueue((q) => q.map((item) => ({ ...item, school: g?.schools[0] ?? "" })));
  }

  function onFiles(files: FileList | null) {
    const list = Array.from(files ?? []);
    setQueue(list.map((file) => ({ file, school: schools[0] ?? "", jersey: "" })));
  }

  function patchItem(i: number, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  async function runItem(i: number) {
    const { queue: items, gameId: gId } = live.current;
    const item = items[i];
    if (!item) return finish();
    setCurrent(i);
    setFailed(false);
    setBusy(true);
    let started: Awaited<ReturnType<typeof startClipUpload>> | null = null;
    try {
      const label = `clip ${i + 1} of ${items.length}`;
      setStatus(`Preparing upload (${label})…`);
      started = await startClipUpload({ originalExt: item.file.name.split(".").pop() ?? "mp4" });

      setStatus(`Uploading original to private storage (${label})… large files can take a while.`);
      const uploaded = await createClient()
        .storage.from(started.original.bucket)
        .uploadToSignedUrl(started.original.path, started.original.token, item.file, {
          contentType: item.file.type || "video/mp4",
        });
      if (uploaded.error) throw new Error(`Original upload failed: ${uploaded.error.message}`);

      setStatus(`Making the blurred, watermarked preview on the server (${label})… up to a few minutes.`);
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
        originalName: item.file.name,
        gameId: gId,
        school: item.school,
        jersey: item.jersey.trim().replace(/^#/, ""),
      });
      setStatus(`Preview ready (${label}). Watch it below, then approve to save the clip.`);
    } catch (error) {
      // Nothing was saved as a clip. Remove any file that did get uploaded.
      if (started) {
        await discardClipUpload({
          clipId: started.clipId,
          originalPath: started.original.path,
          previewPath: started.preview.path,
        }).catch(() => undefined);
      }
      setFailed(true);
      setStatus(`${error instanceof Error ? error.message : "Something went wrong."} Nothing was saved for this file.`);
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    setStatus("All clips handled. Reloading…");
    window.location.reload();
  }

  async function advance() {
    const next = (current ?? -1) + 1;
    setPending(null);
    if (next >= live.current.queue.length) return finish();
    await runItem(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gameId) return setStatus("Pick a game.");
    if (queue.length === 0) return setStatus("Choose at least one video.");
    if (queue.some((q) => !q.school)) return setStatus("Choose a school for every clip.");
    live.current = { queue, gameId };
    await runItem(0);
  }

  async function approve() {
    if (!pending) return;
    setBusy(true);
    try {
      setStatus("Saving clip…");
      const saved = await finalizeClip({
        clipId: pending.clipId,
        gameId: pending.gameId,
        athleteId: null,
        price: INDIVIDUAL_PRICE_CENTS / 100,
        previewPath: pending.previewPath,
        originalPath: pending.originalPath,
        school: pending.school,
        jerseyNumber: pending.jersey,
      });
      const note = saved && saved.metaSaved === false
        ? " Saved, but school/jersey were NOT stored: run the database update (migration 0006) in Supabase, then set them on the clip."
        : "";
      setBusy(false);
      if (note) setStatus(`Clip saved (unpublished).${note}`);
      await advance();
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
      setStatus("Discarded. The uploaded files were removed and no clip was created.");
      setBusy(false);
      await advance();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove the uploaded files.");
      setBusy(false);
    }
  }

  const working = busy || pending !== null || (current !== null && !failed);

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mt-6 space-y-3 rounded-lg border border-border p-4"
    >
      <h2 className="font-semibold">New clips</h2>
      <p className="text-sm text-muted">
        1) Pick the game. 2) Choose one or many videos. 3) Set each clip&apos;s school and jersey number.
        Publish them afterwards from the list below.
      </p>
      <select
        name="game_id"
        required
        value={gameId}
        onChange={(e) => onGameChange(e.target.value)}
        disabled={working}
        className={inputClass}
      >
        <option value="" disabled>
          Select game…
        </option>
        {games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
      </select>

      <label className="block text-sm text-muted">
        Original videos (kept private; MP4 or MOV). A smoothly blurred, watermarked, low-quality preview is made
        from each automatically. Keep this tab open until all previews have been reviewed.
        <input
          name="original_file"
          type="file"
          multiple
          accept="video/mp4,video/quicktime"
          disabled={working}
          onChange={(e) => onFiles(e.target.files)}
          className="mt-1 w-full rounded border border-border px-3 py-2 text-foreground"
        />
      </label>

      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((item, i) => (
            <li
              key={`${item.file.name}-${i}`}
              className={
                "grid gap-2 rounded border p-2 sm:grid-cols-[1fr_auto_auto] sm:items-center " +
                (current === i ? "border-accent" : "border-border")
              }
            >
              <span className="truncate text-sm" title={item.file.name}>
                {i + 1}. {item.file.name}
              </span>
              <select
                aria-label={`School for ${item.file.name}`}
                value={item.school}
                disabled={working || !game}
                onChange={(e) => patchItem(i, { school: e.target.value })}
                className="rounded border border-border px-2 py-2 text-sm"
              >
                {!game && <option value="">Pick a game first</option>}
                {schools.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Jersey number for ${item.file.name}`}
                inputMode="numeric"
                maxLength={8}
                placeholder="Jersey #"
                value={item.jersey}
                disabled={working}
                onChange={(e) => patchItem(i, { jersey: e.target.value })}
                className="w-full rounded border border-border px-2 py-2 text-sm sm:w-24"
              />
            </li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={working}
        className="rounded bg-accent px-3 py-2 font-medium text-white disabled:opacity-60"
      >
        {busy ? "Working…" : queue.length > 1 ? `Upload ${queue.length} clips and make previews` : "Upload and make preview"}
      </button>

      {failed && current !== null && (
        <button
          type="button"
          onClick={() => void advance()}
          className="ml-2 rounded border border-border px-3 py-2 text-sm"
        >
          {current + 1 < queue.length ? "Skip this file, continue" : "Finish"}
        </button>
      )}

      {pending && (
        <div className="space-y-2 rounded border border-border p-3">
          <p className="text-sm font-medium">
            Review the public preview of {pending.originalName}
            {pending.jersey ? ` (#${pending.jersey}, ${pending.school})` : ` (${pending.school})`}
          </p>
          <video src={pending.previewUrl} controls playsInline className="max-h-96 w-full rounded bg-black" />
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
