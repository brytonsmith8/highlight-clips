/**
 * Pure filtering / grouping helpers for the public "Find Your Clips" page.
 * No database access here so it can be tested on its own.
 */

export interface DiscoveryItem {
  clipId: string;
  gameId: string;
  schoolA: string;
  schoolB: string;
  /** The school this clip is for, when the admin set one. */
  school: string | null;
  sport: string | null;
  /** "YYYY-MM-DD" */
  date: string;
  jersey: string | null;
}

export interface Filters {
  school?: string;
  sport?: string;
  date?: string;
  game?: string;
  jersey?: string;
}

export type FilterKey = keyof Filters;
export const FILTER_KEYS: FilterKey[] = ["school", "sport", "date", "game", "jersey"];

export function normalizeJersey(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().replace(/^#/, "");
  return v === "" ? null : v;
}

/** A clip with no school set belongs to either school of its game. */
function matchesSchool(item: DiscoveryItem, school: string): boolean {
  const s = school.toLowerCase();
  if (item.school) return item.school.toLowerCase() === s;
  return item.schoolA.toLowerCase() === s || item.schoolB.toLowerCase() === s;
}

function matches(item: DiscoveryItem, f: Filters, skip?: FilterKey): boolean {
  if (skip !== "school" && f.school && !matchesSchool(item, f.school)) return false;
  if (skip !== "sport" && f.sport && (item.sport ?? "").toLowerCase() !== f.sport.toLowerCase()) return false;
  if (skip !== "date" && f.date && item.date !== f.date) return false;
  if (skip !== "game" && f.game && item.gameId !== f.game) return false;
  if (skip !== "jersey" && f.jersey && normalizeJersey(item.jersey) !== normalizeJersey(f.jersey)) return false;
  return true;
}

export function applyFilters(items: DiscoveryItem[], f: Filters): DiscoveryItem[] {
  return items.filter((i) => matches(i, f));
}

function sortedUnique(values: string[], compare?: (a: string, b: string) => number): string[] {
  return Array.from(new Set(values)).sort(compare);
}

const numericFirst = (a: string, b: string) => {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
};

export interface Facets {
  schools: string[];
  sports: string[];
  dates: string[];
  jerseys: string[];
  games: { id: string; label: string; date: string }[];
}

/**
 * Options for each filter, based on the clips that match every OTHER filter
 * (so picking a school only offers that school's game dates and jersey numbers).
 */
export function facets(items: DiscoveryItem[], f: Filters): Facets {
  const forSchool = items.filter((i) => matches(i, f, "school"));
  const schools = sortedUnique(
    forSchool.flatMap((i) => (i.school ? [i.school] : [i.schoolA, i.schoolB])),
    (a, b) => a.localeCompare(b),
  );
  const sports = sortedUnique(
    items.filter((i) => matches(i, f, "sport")).flatMap((i) => (i.sport ? [i.sport] : [])),
    (a, b) => a.localeCompare(b),
  );
  const dates = sortedUnique(
    items.filter((i) => matches(i, f, "date")).map((i) => i.date),
    (a, b) => b.localeCompare(a),
  );
  const jerseys = sortedUnique(
    items
      .filter((i) => matches(i, f, "jersey"))
      .flatMap((i) => {
        const j = normalizeJersey(i.jersey);
        return j ? [j] : [];
      }),
    numericFirst,
  );
  const gameMap = new Map<string, { id: string; label: string; date: string }>();
  for (const i of items.filter((x) => matches(x, f, "game"))) {
    gameMap.set(i.gameId, { id: i.gameId, label: `${i.schoolA} vs ${i.schoolB}`, date: i.date });
  }
  const games = Array.from(gameMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  return { schools, sports, dates, jerseys, games };
}

export function parseFilters(params: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string): string | undefined => {
    const v = params[k];
    const s = Array.isArray(v) ? v[0] : v;
    const t = (s ?? "").trim().slice(0, 120);
    return t === "" ? undefined : t;
  };
  return {
    school: one("school"),
    sport: one("sport"),
    date: one("date"),
    game: one("game"),
    jersey: normalizeJersey(one("jersey")) ?? undefined,
  };
}

export function filtersToQuery(f: Filters, override: Partial<Record<FilterKey, string | null>> = {}): string {
  const merged: Record<string, string | undefined> = { ...f };
  for (const [k, v] of Object.entries(override)) merged[k] = v ?? undefined;
  const qs = new URLSearchParams();
  for (const k of FILTER_KEYS) if (merged[k]) qs.set(k, merged[k] as string);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** "#3 Jordan Smith · Booneville": whatever is known about the athlete, for cart / admin labels. */
export function athleteDisplayLabel(a: { jersey?: string | null; name?: string | null; school?: string | null }): string {
  const j = normalizeJersey(a.jersey);
  const head = [j ? `#${j}` : "", (a.name ?? "").trim()].filter(Boolean).join(" ");
  return [head || "Athlete", (a.school ?? "").trim()].filter(Boolean).join(" · ");
}
