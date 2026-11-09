import "server-only";

import { isMissingColumnError } from "@/lib/admin/clip-meta";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Admin-only "test footage" flag (clips.is_test, migration 0007). The column is NOT granted to the public roles,
 * so customers can never see it. Nothing here deletes anything; flagging changes only the flag.
 */
export async function testFlagReady(): Promise<boolean> {
  const { error } = await createServiceClient().from("clips").select("is_test").limit(1);
  return !error;
}

export async function adminTestClipIds(): Promise<Set<string>> {
  const { data, error } = await createServiceClient().from("clips").select("id").eq("is_test", true);
  if (error || !data) return new Set();
  return new Set((data as { id: string }[]).map((r) => r.id));
}

export async function setClipsTestFlag(ids: string[], flag: boolean): Promise<{ ok: boolean; message: string; count: number }> {
  if (ids.length === 0) return { ok: true, message: "Nothing to change.", count: 0 };
  const { data, error } = await createServiceClient().from("clips").update({ is_test: flag }).in("id", ids).select("id");
  if (error) {
    return {
      ok: false,
      count: 0,
      message: isMissingColumnError(error.message)
        ? "The database update (migration 0007) has not been run yet."
        : error.message,
    };
  }
  return { ok: true, message: "Updated.", count: data?.length ?? 0 };
}

/** Flag every currently published clip. Does not unpublish, edit or delete anything. */
export async function flagAllPublishedAsTest(): Promise<{ ok: boolean; message: string; count: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("clips").select("id").eq("published", true);
  if (error) return { ok: false, message: error.message, count: 0 };
  return setClipsTestFlag((data ?? []).map((r: { id: string }) => r.id), true);
}

/** Take TEST clips off the public site (published=false). Files, purchases and rows stay; reversible. */
export async function unpublishTestClips(): Promise<{ ok: boolean; message: string; count: number }> {
  const { data, error } = await createServiceClient()
    .from("clips")
    .update({ published: false })
    .eq("is_test", true)
    .eq("published", true)
    .select("id");
  if (error) return { ok: false, message: error.message, count: 0 };
  return { ok: true, message: "Unpublished.", count: data?.length ?? 0 };
}
