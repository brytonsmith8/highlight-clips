"use client";

import { useRef, useState, type FormEvent } from "react";

import { discardClipUpload, finalizeClip, startClipUpload } from "@/app/admin/clips/actions";
import { createAthleteProfile } from "@/app/admin/athletes/actions";
import {
  BUNDLE_MIN_CLIPS,
  BUNDLE_PRICE_CENTS,
  DEFAULT_CLIP_PRICE_DOLLARS,
  INDIVIDUAL_PRICE_CENTS,
  formatCents,
} from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";

export interface ClipFormGame {
  id: string;
  label: string;
  schools: string[];
}

export interface ClipFormAthlete {
  id: string;
  school: string;
  jersey: string;
  label: string;
}

interface QueueItem {
  file: File;
  school: string;
  jersey: string;
  /** "" = no athlete profile, "new" = create one from school + jersey + name, otherwise an existing profile id. */
  athleteId: string;
  name: string;
}

interface Pending {
  clipId: string;
  originalPath: string;
  previewPath: string;
  previewUrl: string;
  previewBytes: number;
  originalName: string;
  gameId: string;
  price: number;
  school: string;
  jersey: string;
  athleteId: string;
  name: string;
}

const inputClass = "w-full rounded border border-border px-3 py-2";

/**
 * New-clips form. Pick the game once, choose one or MANY original videos, then give each clip its school and
 * jersey number. Each original uploads straight from the browser to the PRIVATE Supabase bucket, the server
 * makes the blurred, watermarked, low-quality public preview with FFmpeg, and you review that preview before the
 * clip is saved (unpublished). Clips are handled one at a time, in order. Price is fixed by the site
 * (the site charges $12.50 each, or $10.50 each for 4+). The saved listing price defaults to $12.50 and can be edited.
 */
export function NewClipForm({
  games,
  athletes,
  jerseyOptions = {},
  selectedGameId,
}: {
  /** When this changes (e.g. a game was just created on the dashboard) that game is selected. */
  selectedGameId?: string;
  games: ClipFormGame[];
  athletes: ClipFormAthlete[];
  /** Previously used jersey numbers per school (key: lower-case school name). */
  jerseyOptions?: Record<string, string[]>;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gameId, setGameId] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The latest queue/game for async steps (state would be stale inside them).
  const live = useRef<{ queue: QueueItem[]; gameId: string; price: number }>({
    queue: [],
    gameId: "",
    price: DEFAULT_CLIP_PRICE_DOLLARS,
  });
  // New athlete profiles already created during this batch, so five clips of #3 make ONE profile.
  const created = useRef(new Map<string, string>());

  const game = games.find((g) => g.id === gameId);
  const schools = game?.schools ?? [];
  // The price customers pay is set by the site (lib/pricing.ts), never per clip. New clips are saved at the
  // standard single-clip price so the stored value always matches what the site charges for one clip.
  const priceValue = DEFAULT_CLIP_PRICE_DOLLARS;

  // Adjusting state when a prop changes (React-approved pattern; no effect needed).
  const [seenSelected, setSeenSelected] = useState(selectedGameId);
  if (selectedGameId !== seenSelected) {
    setSeenSelected(selectedGameId);
    if (selectedGameId && !busy && pending === null && current === null) onGameChange(selectedGameId);
  }

  function onGameChange(id: string) {
    setGameId(id);
    const g = games.find((x) => x.id === id);
    // Default each clip to the first school; the admin changes it per clip.
    setQueue((q) => q.map((item) => withSuggestion({ ...item, school: g?.schools[0] ?? "" })));
  }

  function onFiles(files: FileList | null) {
    const list = Array.from(files ?? []);
    setQueue(list.map((file) => ({ file, school: schools[0] ?? "", jersey: "", athleteId: "", name: "" })));
  }

  /** If exactly one existing profile has this school + jersey number, pre-select it (the admin can change it). */
  function withSuggestion(item: QueueItem): QueueItem {
    if (item.athleteId && item.athleteId !== "new") {
      const still = athletes.find((a) => a.id === item.athleteId);
      if (still && still.school.toLowerCase() === item.school.toLowerCase()) return item;
    }
    const j = item.jersey.trim().replace(/^#/, "").toLowerCase();
    const matches = j
      ? athletes.filter((a) => a.school.toLowerCase() === item.school.toLowerCase() && a.jersey.toLowerCase() === j)
      : [];
    if (matches.length === 1) return { ...item, athleteId: matches[0].id };
    return item.athleteId === "new" ? item : { ...item, athleteId: "" };
  }

  function patchItem(i: number, patch: Partial<QueueItem>) {
    setQueue((q) =>
      q.map((item, idx) => {
        if (idx !== i) return item;
        const next = { ...item, ...patch };
        return "school" in patch || "jersey" in patch ? withSuggestion(next) : next;
      }),
    );
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
        price: live.current.price,
        school: item.school,
        jersey: item.jersey.trim().replace(/^#/, ""),
        athleteId: item.athleteId,
        name: item.name.trim(),
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
    live.current = { queue, gameId, price: Math.round(priceValue * 100) / 100 };
    await runItem(0);
  }

  async function approve() {
    if (!pending) return;
    setBusy(true);
    try {
      setStatus("Saving clip…");
      // Resolve the athlete profile only now (after approval), so a discarded preview never leaves a stray profile.
      let athleteId: string | null = pending.athleteId && pending.athleteId !== "new" ? pending.athleteId : null;
      if (pending.athleteId === "new") {
        const key = `${pending.school}|${pending.jersey}|${pending.name}`.toLowerCase();
        let id = created.current.get(key);
        if (!id) {
          id = (await createAthleteProfile({ school: pending.school, jersey: pending.jersey, name: pending.name })).id;
          created.current.set(key, id);
        }
        athleteId = id;
      }
      const saved = await finalizeClip({
        clipId: pending.clipId,
        gameId: pending.gameId,
        athleteId,
        price: pending.price,
        previewPath: pending.previewPath,
        originalPath: pending.originalPath,
        school: pending.school,
        jerseyNumber: pending.jersey,
      });
      const note = saved && saved.metaSaved === false
        ? " Saved, but school/jersey were NOT stored: run the database update (migration 0006) in Supabase, then set them on the clip."
        : "";
      setBusy(false);
      if (note) setStatus(`Clip saved (not published).${note}`);
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
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">New clips</h2>
        {busy && current !== null && !pending && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Processing</span>
        )}
        {pending && !busy && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">Ready to review</span>
        )}
      </div>
      <p className="text-sm text-muted">
        1) Pick the game. 2) Choose one or many videos. 3) Set each clip&apos;s school and jersey number.
        Saved clips start as Not Published; publish them from the Recent clips list below.
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

      <div className="rounded border border-border bg-black/[0.03] p-3 text-sm">
        <p className="font-medium">
          Price customers pay: {formatCents(INDIVIDUAL_PRICE_CENTS)} each, or {formatCents(BUNDLE_PRICE_CENTS)} each when
          they buy {BUNDLE_MIN_CLIPS} or more.
        </p>
        <p className="mt-1 text-xs text-muted">
          Set by the site at checkout, so it is the same for every clip and is not edited per clip.
        </p>
      </div>

      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((item, i) => (
            <li
              key={`${item.file.name}-${i}`}
              className={
                "space-y-2 rounded border p-2 " + (current === i ? "border-accent" : "border-border")
              }
            >
              <p className="truncate text-sm font-medium" title={item.file.name}>
                {i + 1}. {item.file.name}
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
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
                  list={`jersey-options-${i}`}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Jersey #"
                  value={item.jersey}
                  disabled={working}
                  onChange={(e) => patchItem(i, { jersey: e.target.value })}
                  className="w-full rounded border border-border px-2 py-2 text-sm"
                />
                <datalist id={`jersey-options-${i}`}>
                  {(jerseyOptions[item.school.trim().toLowerCase().replace(/\s*&\s*/g, " and ")] ?? []).map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  aria-label={`Athlete profile for ${item.file.name}`}
                  value={item.athleteId}
                  disabled={working}
                  onChange={(e) => patchItem(i, { athleteId: e.target.value })}
                  className="rounded border border-border px-2 py-2 text-sm"
                >
                  <option value="">No athlete profile (jersey number only)</option>
                  {athletes
                    .filter((a) => a.school.toLowerCase() === item.school.toLowerCase())
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  <option value="new">+ New athlete profile from this school and jersey</option>
                </select>
                {item.athleteId === "new" && (
                  <input
                    aria-label={`Athlete name for ${item.file.name} (optional)`}
                    placeholder="Athlete name (optional)"
                    value={item.name}
                    disabled={working}
                    onChange={(e) => patchItem(i, { name: e.target.value })}
                    className="rounded border border-border px-2 py-2 text-sm"
                  />
                )}
              </div>
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
