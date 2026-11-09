import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import {
  adminClipCountsByAthlete,
  adminListAthletes,
  adminListGames,
} from "@/lib/admin/queries";
import { adminAthleteMeta } from "@/lib/admin/athlete-meta";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { createAthlete, deleteAthleteAction, updateAthlete } from "./actions";

export const metadata: Metadata = {
  title: "Admin · Athletes",
  robots: { index: false, follow: false },
};

const inputClass = "w-full rounded border border-border px-3 py-2";

export default async function AdminAthletesPage() {
  await requireAdminOrRedirect();
  const [athletes, games, meta] = await Promise.all([
    adminListAthletes(),
    adminListGames(),
    adminAthleteMeta(),
  ]);
  const clipCounts = await adminClipCountsByAthlete(athletes.map((a) => a.id));
  const schools = Array.from(new Set(games.flatMap((g) => [g.school_a, g.school_b]))).sort();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Athletes</h1>
      <p className="mt-1 text-sm text-muted">
        One profile per athlete per school. A clip is linked to the profile (not to a jersey number), so the same
        athlete&apos;s clips from different games stay together, and a jersey number can change later.
      </p>

      <form
        action={createAthlete}
        className="mt-6 space-y-3 rounded-lg border border-border p-4"
      >
        <h2 className="font-semibold">New athlete profile</h2>
        <input name="school" list="school-list" placeholder="School (required)" required className={inputClass} />
        <datalist id="school-list">
          {schools.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <input name="jersey_number" placeholder="Jersey number" maxLength={8} className={inputClass} />
        <input name="name" placeholder="Athlete name (optional)" className={inputClass} />
        <input name="sport" placeholder="Sport (optional)" className={inputClass} />
        <button type="submit" className="rounded bg-accent px-3 py-2 font-medium text-white">
          Create athlete
        </button>
      </form>

      <div className="mt-6 space-y-2">
        {athletes.length === 0 && <p className="text-muted">No athletes yet.</p>}
        {athletes.map((athlete) => {
          const clipCount = clipCounts.get(athlete.id) ?? 0;
          const m = meta.get(athlete.id);
          const title = [
            athlete.jersey_number ? `#${athlete.jersey_number}` : "No number",
            athlete.name || "(no name)",
          ].join(" ");
          return (
            <div key={athlete.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted">
                    {m?.school ?? "No school yet"}
                    {m?.sport ? ` · ${m.sport}` : ""} &middot; {clipCount} clip{clipCount === 1 ? "" : "s"}
                  </p>
                </div>
                <ConfirmButton
                  action={deleteAthleteAction}
                  fields={{ athleteId: athlete.id }}
                  label="Delete"
                  confirmLabel="Delete athlete"
                  confirmPrompt={
                    clipCount > 0
                      ? `Delete "${athlete.name || title}"? ${clipCount} clip(s) stay published but become unlabeled. Purchases are untouched.`
                      : `Delete "${athlete.name || title}"? Not used by any clip.`
                  }
                />
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-accent">Edit profile</summary>
                <form action={updateAthlete} className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="athleteId" value={athlete.id} />
                  <input
                    name="school"
                    list="school-list"
                    defaultValue={m?.school ?? ""}
                    placeholder="School"
                    required
                    aria-label="School"
                    className={inputClass}
                  />
                  <input
                    name="jersey_number"
                    defaultValue={athlete.jersey_number ?? ""}
                    placeholder="Jersey number"
                    maxLength={8}
                    aria-label="Jersey number"
                    className={inputClass}
                  />
                  <input
                    name="name"
                    defaultValue={athlete.name ?? ""}
                    placeholder="Name (optional)"
                    aria-label="Name"
                    className={inputClass}
                  />
                  <input
                    name="sport"
                    defaultValue={m?.sport ?? ""}
                    placeholder="Sport (optional)"
                    aria-label="Sport"
                    className={inputClass}
                  />
                  <button type="submit" className="rounded bg-accent px-3 py-2 font-medium text-white sm:col-span-2">
                    Save profile
                  </button>
                </form>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
