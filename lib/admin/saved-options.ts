import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Saved schools, sports and jersey numbers for the admin forms.
 *
 * - Schools and sports live in the private tables from migration 0011, and are ALSO read from what games,
 *   clips and athletes already use, so a name that has ever been saved never goes missing from a dropdown.
 *   Before the migration is run everything still works from that existing data; new names are then saved
 *   with the game itself.
 * - Names are matched case-insensitively ("booneville" finds "Booneville"), so no duplicates are created.
 * - Jersey numbers are remembered per school from athlete profiles and clips.
 * Callers must run requireAdmin()/requireAdminOrRedirect() first.
 */

export const DEFAULT_SPORTS = [
  "Football",
  "Basketball",
  "Baseball",
  "Softball",
  "Volleyball",
  "Soccer",
  "Track and Field",
  "Cross Country",
  "Wrestling",
  "Tennis",
  "Golf",
  "Swimming",
  "Cheerleading",
];

export function cleanName(value: unknown, max = 120): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Comparison key: case-insensitive, "&" = "and", extra spaces ignored. */
export function nameKey(value: unknown): string {
  return cleanName(value).toLowerCase().replace(/\s*&\s*/g, " and ");
}

function sortNames(names: Iterable<string>): string[] {
  return Array.from(names).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function addUnique(map: Map<string, string>, raw: unknown) {
  const name = cleanName(raw);
  if (!name) return;
  const key = nameKey(name);
  if (!map.has(key)) map.set(key, name);
}

export interface SavedOptions {
  schools: string[];
  sports: string[];
  /** True when the migration-0011 tables exist (new names are then saved on their own). */
  tablesReady: boolean;
}

async function column(table: string, col: string): Promise<string[]> {
  const { data, error } = await createServiceClient().from(table).select(col);
  if (error || !data) return [];
  return (data as unknown as Record<string, string | null>[]).map((r) => r[col] ?? "");
}

export async function listSavedOptions(): Promise<SavedOptions> {
  const [schoolRows, sportRows, a, b, clipSchools, athleteSchools, gameSports, athleteSports] = await Promise.all([
    createServiceClient().from("schools").select("name"),
    createServiceClient().from("sports").select("name"),
    column("games", "school_a"),
    column("games", "school_b"),
    column("clips", "school"),
    column("athletes", "school"),
    column("games", "sport"),
    column("athletes", "sport"),
  ]);
  const tablesReady = !schoolRows.error && !sportRows.error;

  const schools = new Map<string, string>();
  for (const r of (schoolRows.data ?? []) as { name: string }[]) addUnique(schools, r.name);
  for (const n of [...a, ...b, ...clipSchools, ...athleteSchools]) addUnique(schools, n);

  const sports = new Map<string, string>();
  if (!tablesReady) for (const n of DEFAULT_SPORTS) addUnique(sports, n);
  for (const r of (sportRows.data ?? []) as { name: string }[]) addUnique(sports, r.name);
  for (const n of [...gameSports, ...athleteSports]) addUnique(sports, n);

  return { schools: sortNames(schools.values()), sports: sortNames(sports.values()), tablesReady };
}

async function ensureName(table: "schools" | "sports", raw: unknown, max: number): Promise<string> {
  const name = cleanName(raw, max);
  if (!name) throw new Error(`A ${table === "schools" ? "school" : "sport"} name is required.`);
  const options = await listSavedOptions();
  const existing = (table === "schools" ? options.schools : options.sports).find((n) => nameKey(n) === nameKey(name));
  if (existing) return existing;
  const display = table === "sports" ? name.replace(/\s*&\s*/g, " and ") : name;
  const { error } = await createServiceClient().from(table).insert({ name: display });
  // A missing table (migration 0011 not run) or a simultaneous duplicate is fine: the name still goes on the game.
  if (error && !/relation|does not exist|schema cache|duplicate|unique|23505|42P01/i.test(`${error.message} ${error.code ?? ""}`)) {
    throw new Error(error.message);
  }
  return display;
}

/** Returns the saved spelling of this school, saving it first when it is new. */
export function ensureSchool(raw: unknown): Promise<string> {
  return ensureName("schools", raw, 120);
}

/** Returns the saved spelling of this sport, saving it first when it is new. */
export function ensureSport(raw: unknown): Promise<string> {
  return ensureName("sports", raw, 60);
}

/** Previously used jersey numbers per school (key = nameKey(school)), lowest number first. */
export async function adminJerseyOptions(): Promise<Record<string, string[]>> {
  const bySchool = new Map<string, Set<string>>();
  const add = (school: unknown, jersey: unknown) => {
    const key = nameKey(school);
    const j = cleanName(jersey, 8).replace(/^#/, "");
    if (!key || !j) return;
    if (!bySchool.has(key)) bySchool.set(key, new Set());
    bySchool.get(key)!.add(j);
  };
  const [athletes, clips] = await Promise.all([
    createServiceClient().from("athletes").select("school, jersey_number"),
    createServiceClient().from("clips").select("school, jersey_number"),
  ]);
  for (const r of ((athletes.data ?? []) as { school: string | null; jersey_number: string | null }[])) add(r.school, r.jersey_number);
  for (const r of ((clips.data ?? []) as { school: string | null; jersey_number: string | null }[])) add(r.school, r.jersey_number);
  const out: Record<string, string[]> = {};
  for (const [key, set] of bySchool) {
    out[key] = Array.from(set).sort((x, y) => {
      const nx = Number(x), ny = Number(y);
      if (Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny) return nx - ny;
      return x.localeCompare(y);
    });
  }
  return out;
}
