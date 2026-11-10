import Link from "next/link";

import type { ClipWithAthlete } from "@/lib/queries";
import { INDIVIDUAL_PRICE_CENTS, formatCents } from "@/lib/pricing";
import { checkPreviewPublic } from "@/lib/preview-gate";
import { BuyButton } from "@/components/buy-button";

/**
 * The thumbnail + title link to the clip detail / purchase page. The `<Link>`
 * wraps that content directly (no absolute overlay), and the inline
 * `<BuyButton>` sits outside it as a sibling so buying straight from the card
 * still works.
 *
 * `preview_url` is a plain public URL column in this schema (no signed-URL step
 * for previews). `full_url` (the original) is never fetched or rendered here.
 */
export async function ClipCard({
  clip,
  jersey,
  school,
}: {
  clip: ClipWithAthlete;
  /** Jersey number / school set on the clip itself (migration 0006); shown when there is no athlete record. */
  jersey?: string | null;
  school?: string | null;
}) {
  const showPreview = await checkPreviewPublic(clip.preview_url);
  const label = clip.athlete
    ? `${clip.athlete.name}${clip.athlete.jersey_number ? ` #${clip.athlete.jersey_number}` : ""}`
    : jersey
      ? `#${jersey}${school ? ` ${school}` : ""}`
      : "Unlabeled clip";

  return (
    <div className="rounded-lg border border-border p-3 transition-colors hover:border-accent">
      <Link
        href={`/games/${clip.game_id}/clips/${clip.id}`}
        aria-label={`View clip: ${label}`}
        className="block"
      >
        {showPreview && clip.preview_url ? (
          <video
            src={`${clip.preview_url}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            tabIndex={-1}
            className="pointer-events-none aspect-video w-full rounded bg-black"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded border border-border bg-zinc-50 text-sm text-muted">
            Preview being prepared
          </div>
        )}

        <div className="mt-2 flex items-start justify-between gap-2">
          <p className="text-sm font-medium">
            {clip.athlete ? (
              <>
                {clip.athlete.name}
                {clip.athlete.jersey_number
                  ? ` · #${clip.athlete.jersey_number}`
                  : ""}
              </>
            ) : jersey ? (
              <>
                #{jersey}
                {school ? <span className="text-muted"> · {school}</span> : null}
              </>
            ) : (
              <span className="text-muted">Unlabeled clip</span>
            )}
          </p>
          <p className="whitespace-nowrap font-semibold">
            {formatCents(INDIVIDUAL_PRICE_CENTS)}
          </p>
        </div>
      </Link>

      <BuyButton clipId={clip.id} price={INDIVIDUAL_PRICE_CENTS / 100} />
    </div>
  );
}
