"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { flagAllPublishedAsTest, setClipsTestFlag, unpublishTestClips } from "@/lib/admin/test-clips";

function refresh() {
  for (const p of ["/admin/launch", "/admin/clips", "/clips", "/games", "/"]) revalidatePath(p);
}

export async function toggleClipTest(clipId: string, flag: boolean) {
  await requireAdmin();
  const r = await setClipsTestFlag([clipId], flag);
  if (!r.ok) throw new Error(r.message);
  refresh();
}

export async function markAllPublishedAsTest() {
  await requireAdmin();
  const r = await flagAllPublishedAsTest();
  if (!r.ok) throw new Error(r.message);
  refresh();
}

/** Needs the admin to type the exact phrase, so it can never happen by one stray click. Reversible: only unpublishes. */
export async function unpublishAllTestClips(formData: FormData) {
  await requireAdmin();
  if (String(formData.get("confirm") ?? "").trim() !== "UNPUBLISH TEST CLIPS") {
    throw new Error('Type exactly "UNPUBLISH TEST CLIPS" to confirm.');
  }
  const r = await unpublishTestClips();
  if (!r.ok) throw new Error(r.message);
  refresh();
}
