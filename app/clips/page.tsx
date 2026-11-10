import type { Metadata } from "next";
import Link from "next/link";

import { DiscoveryClipCard } from "@/components/discovery-clip-card";
import { CartSummary, SelectableClip, SelectionProvider } from "@/components/clip-selection";
import { getDiscoveryCatalog, type DiscoveryClip } from "@/lib/discovery";
import {
  applyFilters,
  facets,
  filtersToQuery,
  parseFilters,
  type Filters,
} from "@/lib/discovery-filter";
import { formatGameDate } from "@/lib/format";
import { BUNDLE_MIN_CLIPS, BUNDLE_PRICE_CENTS, INDIVIDUAL_PRICE_CENTS, formatCents } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Find Your Clips",
  description:
    "Find your highlight clips by school, sport, game date and jersey number. No account needed.",
};

// Always fresh: new uploads and publishes should show up right away.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const selectClass =
  "w-full rounded border border-white/25 bg-neutral-900 px-3 py-3 text-base text-white focus:border-red-500 focus:outline-none";

function chipClass(active: boolean): string {
  return (
    "inline-flex min-w-12 items-center justify-center rounded-full border px-4 py-2 font-display text-xl font-bold tracking-wide transition-colors " +
    (active
      ? "border-red-600 bg-red-600 text-white"
      : "border-white/25 text-white hover:border-red-500")
  );
}

function FilterSelect({
  name,
  label,
  value,
  allLabel,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  // Keep the current choice visible even if no clip matches it any more.
  const hasValue = !value || options.some((o) => o.value === value);
  return (
    <label className="block text-xs font-semibold uppercase tracking-widest text-white/70">
      {label}
      <select name={name} defaultValue={value ?? ""} className={`mt-1 ${selectClass} normal-case tracking-normal`}>
        <option value="">{allLabel}</option>
        {!hasValue && value && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function groupByGame(entries: DiscoveryClip[]) {
  const groups = new Map<string, DiscoveryClip[]>();
  for (const e of entries) {
    const list = groups.get(e.game.id) ?? [];
    list.push(e);
    groups.set(e.game.id, list);
  }
  return Array.from(groups.values()).sort((a, b) =>
    b[0].game.game_date.localeCompare(a[0].game.game_date),
  );
}

function jerseySort(a: DiscoveryClip, b: DiscoveryClip): number {
  const ja = a.jersey ?? "";
  const jb = b.jersey ?? "";
  if (ja === jb) return 0;
  if (!ja) return 1;
  if (!jb) return -1;
  return ja.localeCompare(jb, undefined, { numeric: true });
}

export default async function FindYourClipsPage({ searchParams }: PageProps) {
  const filters: Filters = parseFilters(await searchParams);
  const catalog = await getDiscoveryCatalog();
  const items = catalog.map((c) => c.item);
  const f = facets(items, filters);

  const matchedIds = new Set(applyFilters(items, filters).map((i) => i.clipId));
  const results = catalog.filter((c) => matchedIds.has(c.clip.id));
  const groups = groupByGame(results);
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <SelectionProvider>
    <div className="on-dark hero-bg text-white">
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-6 md:pt-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-widest text-white/70 transition-colors hover:text-red-500"
        >
          <span aria-hidden="true">&larr;</span> Home
        </Link>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-red-500">
          Athletes &amp; families
        </p>
        <h1 className="mt-2 font-display text-6xl font-extrabold uppercase leading-[0.9] tracking-tight sm:text-7xl">
          Find your <span className="text-red-600">clips</span>
        </h1>
        <p className="mt-4 max-w-prose text-base leading-7 text-white/80">
          Choose your school, sport, game date and jersey number. Watch the free preview, then buy
          and download your plays. No account needed.
        </p>
        <p className="mt-3 inline-block rounded border border-red-600/60 bg-red-600/10 px-3 py-2 text-sm font-semibold">
          {formatCents(INDIVIDUAL_PRICE_CENTS)} per clip &middot; Buy {BUNDLE_MIN_CLIPS} or more from the
          same game and every clip is {formatCents(BUNDLE_PRICE_CENTS)}.
        </p>

        <form
          method="get"
          action="/clips"
          className="mt-8 rounded-lg border border-white/15 bg-neutral-900/80 p-4 sm:p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              name="school"
              label="School"
              value={filters.school}
              allLabel="All schools"
              options={f.schools.map((s) => ({ value: s, label: s }))}
            />
            <FilterSelect
              name="sport"
              label="Sport"
              value={filters.sport}
              allLabel="All sports"
              options={f.sports.map((s) => ({ value: s, label: s }))}
            />
            <FilterSelect
              name="date"
              label="Game date"
              value={filters.date}
              allLabel="Any date"
              options={f.dates.map((d) => ({ value: d, label: formatGameDate(d) }))}
            />
            <FilterSelect
              name="game"
              label="Game"
              value={filters.game}
              allLabel="All games"
              options={f.games.map((g) => ({ value: g.id, label: g.label }))}
            />
            <FilterSelect
              name="jersey"
              label="Jersey number"
              value={filters.jersey}
              allLabel="Any number"
              options={f.jerseys.map((j) => ({ value: j, label: `#${j}` }))}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded bg-red-600 px-8 py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-red-500"
            >
              Show clips
            </button>
            {anyFilter && (
              <Link
                href="/clips"
                className="text-sm font-semibold text-white/80 underline-offset-4 hover:text-red-500 hover:underline"
              >
                Clear filters
              </Link>
            )}
          </div>
        </form>

        {f.jerseys.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
              Tap a jersey number
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={`/clips${filtersToQuery(filters, { jersey: null })}`}
                className={chipClass(!filters.jersey)}
              >
                All
              </Link>
              {f.jerseys.map((j) => (
                <Link
                  key={j}
                  href={`/clips${filtersToQuery(filters, { jersey: j })}`}
                  className={chipClass(filters.jersey === j)}
                >
                  #{j}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8" aria-live="polite">
          {results.length === 0 ? (
            <div className="rounded-lg border border-white/15 bg-neutral-900 p-8 text-center">
              <p className="font-display text-3xl font-bold uppercase">No clips found</p>
              <p className="mt-2 text-white/70">
                {anyFilter
                  ? "Nothing matches those choices yet. Try clearing a filter, or check back soon: new clips are added after every game."
                  : "New clips are added after every game. Check back soon."}
              </p>
              {anyFilter && (
                <Link
                  href="/clips"
                  className="mt-5 inline-block rounded border-2 border-white px-6 py-3 text-sm font-bold uppercase tracking-widest transition-colors hover:bg-white hover:text-black"
                >
                  Show all clips
                </Link>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-white/70">
                {results.length} clip{results.length === 1 ? "" : "s"} from {groups.length} game
                {groups.length === 1 ? "" : "s"}
              </p>
              <div className="mt-4 space-y-10">
                {groups.map((group) => {
                  const game = group[0].game;
                  const sport = group[0].sport;
                  const sorted = [...group].sort(jerseySort);
                  return (
                    <section key={game.id} aria-labelledby={`game-${game.id}`}>
                      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-red-600 pb-3">
                        <div>
                          <h2
                            id={`game-${game.id}`}
                            className="font-display text-4xl font-extrabold uppercase leading-none tracking-wide"
                          >
                            {game.school_a} vs {game.school_b}
                          </h2>
                          <p className="mt-2 text-sm text-white/75">
                            {formatGameDate(game.game_date)}
                            {sport ? ` · ${sport}` : ""}
                          </p>
                          {group[0].gameTitle && <p className="mt-1 text-sm text-white/60">{group[0].gameTitle}</p>}
                        </div>
                        <Link
                          href={`/games/${game.id}${filtersToQuery({ jersey: filters.jersey })}`}
                          className="text-sm font-semibold text-red-500 hover:underline"
                        >
                          Open game &amp; pick several &rarr;
                        </Link>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {sorted.map((entry) => (
                          <SelectableClip
                            key={entry.clip.id}
                            clipId={entry.clip.id}
                            gameId={entry.game.id}
                            athleteId={entry.clip.athlete_id}
                            athleteLabel={entry.athleteLabel}
                          >
                            <DiscoveryClipCard entry={entry} />
                          </SelectableClip>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <CartSummary />
      </div>
    </div>
    </SelectionProvider>
  );
}
