import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getGameBySlug, getPublicClips } from "@/lib/queries";
import { formatGameDate } from "@/lib/format";
import { ExpiryBadge } from "@/components/expiry-badge";
import { TeamCategoryFilter } from "@/components/team-category-filter";
import { ClipCard } from "@/components/clip-card";

interface GamePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ team?: string; category?: string }>;
}

export async function generateMetadata({
  params,
}: GamePageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getGameBySlug(slug);
  if (!data) return { title: "Game not available" };
  return {
    title: data.game.title,
    description: `Highlight clips from ${data.game.title}.`,
  };
}

export default async function GamePage({
  params,
  searchParams,
}: GamePageProps) {
  const { slug } = await params;
  const { team, category } = await searchParams;

  const data = await getGameBySlug(slug);
  if (!data) notFound();

  const { game, teams, categories } = data;

  // Only honour filter ids that actually belong to this game.
  const activeTeam = teams.some((t) => t.id === team) ? team : undefined;
  const activeCategory = categories.some((c) => c.id === category)
    ? category
    : undefined;

  const clips = await getPublicClips(game.id, {
    teamId: activeTeam,
    categoryId: activeCategory,
  });

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name;
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{game.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {game.sport} &middot; {formatGameDate(game.game_date)}
          </p>
        </div>
        <ExpiryBadge expiresAt={game.expires_at} />
      </div>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Previews are low quality on purpose. After you buy a clip, the
        high-quality download is available for a limited time — download it
        promptly.
      </div>

      {(teams.length > 0 || categories.length > 0) && (
        <div className="mt-6">
          <TeamCategoryFilter
            slug={slug}
            teams={teams}
            categories={categories}
            activeTeam={activeTeam}
            activeCategory={activeCategory}
          />
        </div>
      )}

      <div className="mt-6">
        {clips.length === 0 ? (
          <p className="rounded-lg border border-border p-6 text-center text-muted">
            No clips here yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                teamName={teamName(clip.team_id)}
                categoryName={categoryName(clip.category_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
