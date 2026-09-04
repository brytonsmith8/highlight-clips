import type { PublicClip } from "@/lib/db/types";
import { formatPrice } from "@/lib/format";
import { PreviewPlayer } from "@/components/preview-player";

export function ClipCard({
  clip,
  teamName,
  categoryName,
}: {
  clip: PublicClip;
  teamName?: string;
  categoryName?: string;
}) {
  const title = [categoryName ?? "Clip", clip.jersey_number ? `#${clip.jersey_number}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-lg border border-border p-3">
      <PreviewPlayer clipId={clip.id} />

      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="text-sm">
          <p className="font-medium">{title}</p>
          {teamName ? <p className="text-muted">{teamName}</p> : null}
          {clip.description ? (
            <p className="mt-1 text-muted">{clip.description}</p>
          ) : null}
        </div>
        <p className="whitespace-nowrap font-semibold">
          {formatPrice(clip.price_cents, clip.currency)}
        </p>
      </div>

      {/* Add-to-cart / purchase controls arrive in Layer 4. */}
    </div>
  );
}
