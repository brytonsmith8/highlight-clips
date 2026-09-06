import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getClipById, getGameById } from "@/lib/queries";
import { formatGameDate, formatPrice } from "@/lib/format";
import { isPlayablePreviewUrl } from "@/lib/preview";
import { BuyButton } from "@/components/buy-button";

interface ClipPageProps {
  params: Promise<{ id: string; clipId: string }>;
}

export async function generateMetadata({
  params,
}: ClipPageProps): Promise<Metadata> {
  const { id, clipId } = await params;
  const clip = await getClipById(clipId);
  if (!clip || clip.game_id !== id) return { title: "Clip not found" };
  const who = clip.athlete ? clip.athlete.name : "Highlight clip";
  return { title: `${who} · ${formatPrice(clip.price)}` };
}

export default async function ClipPage({ params }: ClipPageProps) {
  const { id, clipId } = await params;

  const clip = await getClipById(clipId);
  if (!clip || clip.game_id !== id) notFound();

  const game = await getGameById(id);
  if (!game) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/games/${game.id}`}
        className="text-sm text-accent hover:underline"
      >
        &larr; {game.school_a} vs {game.school_b}
      </Link>

      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        {clip.athlete ? (
          <>
            {clip.athlete.name}
            {clip.athlete.jersey_number ? ` · #${clip.athlete.jersey_number}` : ""}
          </>
        ) : (
          "Highlight clip"
        )}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {game.school_a} vs {game.school_b} &middot;{" "}
        {formatGameDate(game.game_date)}
      </p>

      <div className="mt-6">
        {isPlayablePreviewUrl(clip.preview_url) ? (
          <video
            src={clip.preview_url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-lg bg-black"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-zinc-50 text-sm text-muted">
            Preview unavailable
          </div>
        )}
      </div>

      <p className="mt-4 text-lg font-semibold">{formatPrice(clip.price)}</p>
      <p className="mt-1 text-sm text-muted">
        Preview quality shown above. Purchase to download the full-quality clip.
      </p>

      <div className="mt-3 max-w-xs">
        <BuyButton clipId={clip.id} price={clip.price} />
      </div>
    </div>
  );
}
