"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { STORAGE_BUCKETS } from "@/lib/db/types";

/** Seconds a generated preview URL stays valid. */
const PREVIEW_URL_TTL_SECONDS = 30 * 60;

export type PreviewUrlResult = { url: string } | { error: string };

/**
 * Mint a short-lived signed URL for a clip's low-quality preview.
 *
 * Only clips that are currently public (via the `public_clips` view — published,
 * approved, game active and in-window) resolve. The high-quality original is
 * never touched here. Requires `SUPABASE_SERVICE_ROLE_KEY`; if it's not set the
 * caller gets `{ error }` and shows a placeholder.
 */
export async function getPreviewUrl(clipId: string): Promise<PreviewUrlResult> {
  try {
    const supabase = createServiceClient();

    const { data: clip, error } = await supabase
      .from("public_clips")
      .select("id, preview_path")
      .eq("id", clipId)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!clip?.preview_path) return { error: "preview-unavailable" };

    const { data, error: signError } = await supabase.storage
      .from(STORAGE_BUCKETS.previews)
      .createSignedUrl(clip.preview_path, PREVIEW_URL_TTL_SECONDS);

    if (signError || !data) {
      return { error: signError?.message ?? "sign-failed" };
    }
    return { url: data.signedUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "unknown-error" };
  }
}
