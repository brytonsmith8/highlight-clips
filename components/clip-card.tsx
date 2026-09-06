import Link from "next/link";

import type { ClipWithAthlete } from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import { isPlayablePreviewUrl } from "@/lib/preview";
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
export function ClipCard({ clip }: { clip: ClipWithAthlete }) {
  const label = clip.athlete
    ? `${clip.athlete.name}${clip.athlete.jersey_number ? ` #${clip.athlete.jersey_number}` : ""}`
    : "Unlabeled clip";

  return (
    <div className="rounded-lg border border-border p-3 transition-colors hover:border-accent">
      <Link
        href={`/games/${clip.game_id}/clips/${clip.id}`}
        aria-label={`View clip: ${label}`}
        className="block"
      >
        {isPlayablePreviewUrl(clip.preview_url) ? (
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
            Preview unavailable
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
            ) : (
              <span className="text-muted">Unlabeled clip</span>
            )}
          </p>
          <p className="whitespace-nowrap font-semibold">
            {formatPrice(clip.price)}
          </p>
        </div>
      </Link>

      <BuyButton clipId={clip.id} price={clip.price} />
    </div>
  );
}
