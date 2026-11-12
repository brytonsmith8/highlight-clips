"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createGame } from "@/app/admin/games/actions";
import { NEW_OPTION } from "@/lib/admin/form-constants";

const inputClass = "w-full rounded border border-border px-3 py-2";

export interface NewGameDefaults {
  home?: string;
  away?: string;
  sport?: string;
}

/**
 * New-game form. Home team, away team and sport are dropdowns of everything saved so far; "+ Add new" reveals a
 * text box and saves the new name for every later upload. The date uses the browser's calendar picker (month and
 * year can be changed there). Pass `defaults` to start from a previous matchup.
 */
export function NewGameForm({
  schools,
  sports,
  defaults,
  tablesReady,
}: {
  schools: string[];
  sports: string[];
  defaults?: NewGameDefaults;
  tablesReady: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const initial = (value: string | undefined, list: string[]) => (value && list.includes(value) ? value : "");
  const [home, setHome] = useState(initial(defaults?.home, schools));
  const [away, setAway] = useState(initial(defaults?.away, schools));
  const [sport, setSport] = useState(initial(defaults?.sport, sports));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await createGame(data);
        setMessage({ ok: result.ok, text: result.message });
        if (result.ok) {
          formRef.current?.reset();
          setHome("");
          setAway("");
          setSport("");
          router.refresh();
        }
      } catch (error) {
        setMessage({ ok: false, text: error instanceof Error ? error.message : "Something went wrong." });
      }
    });
  }

  function schoolField(name: "school_a" | "school_b", label: string, value: string, set: (v: string) => void) {
    return (
      <div className="space-y-2">
        <select
          name={name}
          required
          value={value}
          onChange={(e) => set(e.target.value)}
          aria-label={label}
          className={inputClass}
        >
          <option value="" disabled>
            {label}…
          </option>
          {schools.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={NEW_OPTION}>+ Add a new school…</option>
        </select>
        {value === NEW_OPTION && (
          <input
            name={`${name}_new`}
            placeholder="New school name"
            aria-label={`New school name (${label})`}
            required
            maxLength={120}
            autoFocus
            className={inputClass}
          />
        )}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="mt-6 space-y-3 rounded-lg border border-border p-4"
    >
      <h2 className="font-semibold">New game</h2>
      <p className="text-sm text-muted">
        One listing per game. Add every athlete&apos;s clips to it afterwards, so you never need a separate game for each
        athlete. Pick saved schools and sports, or add a new one once and it stays in the lists.
      </p>
      {!tablesReady && (
        <p className="rounded border border-border p-2 text-xs text-muted">
          The saved school and sport lists (migration 0011) have not been set up yet. Everything still works: schools and
          sports you have already used are listed, and new ones are saved with the game.
        </p>
      )}
      {schoolField("school_a", "Home team", home, setHome)}
      {schoolField("school_b", "Away team", away, setAway)}
      <label className="block text-sm text-muted">
        Game date
        <input name="game_date" type="date" required className={`${inputClass} mt-1 text-foreground`} />
      </label>
      <div className="space-y-2">
        <select
          name="sport"
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          aria-label="Sport"
          className={inputClass}
        >
          <option value="">Sport (optional)…</option>
          {sports.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={NEW_OPTION}>+ Add a new sport…</option>
        </select>
        {sport === NEW_OPTION && (
          <input
            name="sport_new"
            placeholder="New sport name"
            aria-label="New sport name"
            required
            maxLength={60}
            autoFocus
            className={inputClass}
          />
        )}
      </div>
      <input
        name="title"
        placeholder="Game title or details (optional)"
        maxLength={160}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-3 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Create game"}
      </button>
      {message && (
        <p role="status" className={"text-sm " + (message.ok ? "text-foreground" : "text-red-500")}>
          {message.text}
        </p>
      )}
    </form>
  );
}
