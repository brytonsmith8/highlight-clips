import Link from "next/link";

import { ConfirmButton } from "@/components/admin/confirm-button";
import { deleteClipAction, setClipPublished } from "@/app/admin/clips/actions";
import { updateClipMeta } from "@/app/admin/clips/meta-actions";
import {
  clipStatusLabel,
  type ClipStatusFilter,
  type RecentClip,
  type RecentClipsResult,
} from "@/lib/admin/dashboard-data";
import { formatGameDate } from "@/lib/format";
import { BUNDLE_MIN_CLIPS, BUNDLE_PRICE_CENTS, INDIVIDUAL_PRICE_CENTS, formatCents } from "@/lib/pricing";

export interface AthleteChoice {
  id: string;
  school: string;
  label: string;
}

const FILTERS: { id: ClipStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "not_published", label: "Not Published" },
];

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-xs font-semibold " +
        (published ? "bg-green-100 text-green-900" : "bg-gray-200 text-gray-800")
      }
    >
      {clipStatusLabel(published ? "published" : "not_published")}
    </span>
  );
}

function ClipRow({ clip, athletes }: { clip: RecentClip; athletes: AthleteChoice[] }) {
  const who = [clip.jersey ? `#${clip.jersey}` : null, clip.athleteName].filter(Boolean).join(" ") || "No athlete";
  const options = athletes.filter(
    (a) => a.id === clip.athleteId || clip.schools.some((s) => s.toLowerCase() === a.school.toLowerCase()),
  );

  return (
    <li className="rounded-lg border border-border bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span>{who}</span>
            <StatusBadge published={clip.published} />
          </p>
          <p className="mt-0.5 text-muted">
            {clip.gameLabel}
            {clip.gameDate ? ` · ${formatGameDate(clip.gameDate)}` : ""}
            {clip.sport ? ` · ${clip.sport}` : ""}
            {clip.school ? ` · ${clip.school}` : ""}
          </p>
          <p className="mt-0.5 text-muted">
            {formatCents(INDIVIDUAL_PRICE_CENTS)} each ({formatCents(BUNDLE_PRICE_CENTS)} for {BUNDLE_MIN_CLIPS}+) &middot;{" "}
            {clip.purchases} purchase{clip.purchases === 1 ? "" : "s"}
          </p>
        </div>
        <form action={setClipPublished.bind(null, clip.id, !clip.published)}>
          <button
            type="submit"
            className={
              "whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors " +
              (clip.published ? "border-border hover:border-accent" : "border-accent bg-accent text-white")
            }
          >
            {clip.published ? "Unpublish" : "Publish"}
          </button>
        </form>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <details className="w-full">
          <summary className="cursor-pointer text-accent">Preview</summary>
          {clip.previewUrl ? (
            <video
              src={clip.previewUrl}
              controls
              playsInline
              preload="none"
              className="mt-2 max-h-80 w-full rounded bg-black"
            />
          ) : (
            <p className="mt-1 text-muted">No preview file for this clip.</p>
          )}
        </details>
        <details className="w-full">
          <summary className="cursor-pointer text-accent">Edit</summary>
          <form action={updateClipMeta} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="clipId" value={clip.id} />
            <select
              name="athleteId"
              defaultValue={clip.athleteId ?? ""}
              aria-label="Athlete profile"
              className="rounded border border-border px-2 py-1 text-sm"
            >
              <option value="">No athlete profile</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <select
              name="school"
              defaultValue={clip.school ?? ""}
              aria-label="School"
              className="rounded border border-border px-2 py-1 text-sm"
            >
              <option value="">School…</option>
              {clip.schools.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              name="jersey"
              defaultValue={clip.jersey ?? ""}
              placeholder="Jersey #"
              aria-label="Jersey number"
              maxLength={8}
              className="w-24 rounded border border-border px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded border border-border px-2 py-1 text-sm hover:border-accent">
              Save
            </button>
          </form>
          <div className="mt-2">
            {clip.purchases === 0 ? (
              <ConfirmButton
                action={deleteClipAction}
                fields={{ clipId: clip.id }}
                label="Delete"
                confirmLabel="Delete clip"
                confirmPrompt={`Delete this clip and its preview + original files from storage?\n${clip.gameLabel} — ${who}\nNo purchases, so nothing else is affected.`}
              />
            ) : (
              <p className="text-xs text-muted">
                Protected: {clip.purchases} purchase{clip.purchases === 1 ? "" : "s"}. Unpublish instead; buyers keep their
                downloads.
              </p>
            )}
          </div>
        </details>
      </div>
    </li>
  );
}

/** Recent clips for the dashboard: status filter, then the newest clips with Preview / Publish / Edit actions. */
export function RecentClips({ data, status, athletes }: { data: RecentClipsResult; status: ClipStatusFilter; athletes: AthleteChoice[] }) {
  return (
    <section aria-label="Recent clips" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">Recent clips</h2>
        <div className="flex flex-wrap gap-1.5 text-sm">
          {FILTERS.map((f) => {
            const n = f.id === "all" ? data.counts.all : data.counts[f.id];
            return (
              <Link
                key={f.id}
                href={f.id === "all" ? "/admin" : `/admin?status=${f.id}`}
                aria-current={status === f.id ? "true" : undefined}
                className={
                  "rounded-full border px-3 py-1 " +
                  (status === f.id ? "border-accent bg-accent text-white" : "border-border hover:border-accent")
                }
              >
                {f.label} ({n})
              </Link>
            );
          })}
        </div>
      </div>

      {data.clips.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No clips here yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.clips.map((clip) => (
            <ClipRow key={clip.id} clip={clip} athletes={athletes} />
          ))}
        </ul>
      )}

      {data.total > data.clips.length && (
        <p className="mt-3 text-sm text-muted">
          Showing the newest {data.clips.length} of {data.total}.{" "}
          <Link href="/admin/clips" className="text-accent hover:underline">
            See every clip
          </Link>
        </p>
      )}
    </section>
  );
}
