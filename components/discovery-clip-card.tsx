import Link from "next/link";

import { BuyButton } from "@/components/buy-button";
import { INDIVIDUAL_PRICE_CENTS, formatCents } from "@/lib/pricing";
import { checkPreviewPublic } from "@/lib/preview-gate";
import type { DiscoveryClip } from "@/lib/discovery";

/**
 * Dark clip card for the Find Your Clips page. Same protection rules as the
 * game page: the blurred/watermarked preview is only shown after the public
 * preview gate passes, and the original file is never referenced here.
 */
export async function DiscoveryClipCard({ entry }: { entry: DiscoveryClip }) {
  const { clip, game, school, jersey } = entry;
  const showPreview = await checkPreviewPublic(clip.preview_url);
  const title = jersey ? `#${jersey}` : clip.athlete?.name ?? "Highlight";
  const schoolLabel = school ?? null;

  return (
    <div className="rounded-lg border border-white/15 bg-neutral-900 p-3 transition-colors hover:border-red-600">
      <Link
        href={`/games/${game.id}/clips/${clip.id}`}
        aria-label={`View clip: ${title}${schoolLabel ? `, ${schoolLabel}` : ""}`}
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
          <div className="flex aspect-video w-full items-center justify-center rounded border border-white/15 bg-black text-sm text-white/60">
            Preview being prepared
          </div>
        )}

        <div className="mt-3 flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-3xl font-extrabold uppercase leading-none tracking-wide">
              {title}
            </p>
            {(schoolLabel || (jersey && clip.athlete?.name)) && (
              <p className="mt-1 text-xs text-white/65">
                {[jersey ? clip.athlete?.name : null, schoolLabel].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <p className="whitespace-nowrap font-semibold">{formatCents(INDIVIDUAL_PRICE_CENTS)}</p>
        </div>
      </Link>

      <BuyButton clipId={clip.id} price={INDIVIDUAL_PRICE_CENTS / 100} />
    </div>
  );
}
