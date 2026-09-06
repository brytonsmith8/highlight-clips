import Link from "next/link";

import type { ClipWithAthlete } from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import { BuyButton } from "@/components/buy-button";

/**
 * `preview_url` is a plain public URL column in this schema (no private
 * storage bucket / signed-URL step for previews) — played directly.
 * `full_url` (the original) is never fetched or rendered here.
 *
 * The whole card links to the clip detail / purchase page: an absolutely
 * positioned `<Link>` overlay covers the card, the video is a non-interactive
 * thumbnail (`pointer-events-none`), and the inline `<BuyButton>` is lifted
 * back above the overlay (`relative`) so buying straight from the card still
 * works.
 */
export function ClipCard({ clip }: { clip: ClipWithAthlete }) {
  const label = clip.athlete
    ? `${clip.athlete.name}${clip.athlete.jersey_number ? ` #${clip.athlete.jersey_number}` : ""}`
    : "Unlabeled clip";

  return (
    <div className="relative rounded-lg border border-border p-3 transition-colors hover:border-accent">
      {clip.preview_url ? (
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

      <Link
        href={`/games/${clip.game_id}/clips/${clip.id}`}
        aria-label={`View clip: ${label}`}
        className="absolute inset-0 rounded-lg"
      />

      <div className="mt-2 flex items-start justify-between gap-2">
        <p className="text-sm font-medium">
          {clip.athlete ? (
            <>
              {clip.athlete.name}
              {clip.athlete.jersey_number ? ` · #${clip.athlete.jersey_number}` : ""}
            </>
          ) : (
            <span className="text-muted">Unlabeled clip</span>
          )}
        </p>
        <p className="whitespace-nowrap font-semibold">{formatPrice(clip.price)}</p>
      </div>

      <div className="relative">
        <BuyButton clipId={clip.id} price={clip.price} />
      </div>
    </div>
  );
}
