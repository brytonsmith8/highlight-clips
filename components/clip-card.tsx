import type { ClipWithAthlete } from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import { BuyButton } from "@/components/buy-button";

/**
 * `preview_url` is a plain public URL column in this schema (no private
 * storage bucket / signed-URL step for previews) — played directly.
 * `full_url` (the original) is never fetched or rendered here.
 */
export function ClipCard({ clip }: { clip: ClipWithAthlete }) {
  return (
    <div className="rounded-lg border border-border p-3">
      {clip.preview_url ? (
        <video
          src={clip.preview_url}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded bg-black"
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
              {clip.athlete.jersey_number ? ` · #${clip.athlete.jersey_number}` : ""}
            </>
          ) : (
            <span className="text-muted">Unlabeled clip</span>
          )}
        </p>
        <p className="whitespace-nowrap font-semibold">{formatPrice(clip.price)}</p>
      </div>
      <BuyButton clipId={clip.id} price={clip.price} />
    </div>
  );
}
