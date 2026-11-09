import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Admin-side access to the optional columns added by migration 0006
 * (games.sport, clips.school, clips.jersey_number). Kept in its own file and its
 * own queries so that, before the migration is run, a missing column only means
 * "no extra details": the existing admin pages keep working.
 * Callers must run requireAdmin()/requireAdminOrRedirect() first.
 */

export interface AdminClipMeta {
  school: string | null;
  jersey: string | null;
}

export function isMissingColumnError(message: string | undefined | null): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("column") && (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"))
  );
}

export async function adminGameSports(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data, error } = await createServiceClient().from("games").select("id, sport");
  if (error || !data) return out;
  for (const row of data as { id: string; sport: string | null }[]) {
    if (row.sport?.trim()) out.set(row.id, row.sport.trim());
  }
  return out;
}

export async function adminClipMetaByIds(ids: string[]): Promise<Map<string, AdminClipMeta>> {
  const out = new Map<string, AdminClipMeta>();
  if (ids.length === 0) return out;
  const { data, error } = await createServiceClient()
    .from("clips")
    .select("id, school, jersey_number")
    .in("id", ids);
  if (error || !data) return out;
  for (const row of data as { id: string; school: string | null; jersey_number: string | null }[]) {
    out.set(row.id, { school: row.school?.trim() || null, jersey: row.jersey_number?.trim() || null });
  }
  return out;
}

/** True when the 0006 columns exist (used to show a clear "run the database update" note). */
export async function metaColumnsReady(): Promise<boolean> {
  const a = await createServiceClient().from("clips").select("school, jersey_number").limit(1);
  const b = await createServiceClient().from("games").select("sport").limit(1);
  return !a.error && !b.error;
}
