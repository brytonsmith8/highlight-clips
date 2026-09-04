import Link from "next/link";

import type { Category, Team } from "@/lib/db/types";

function pillClass(active: boolean): string {
  return (
    "inline-block rounded-full border px-3 py-1 text-sm transition-colors " +
    (active
      ? "border-accent bg-accent text-white"
      : "border-border text-foreground hover:border-accent")
  );
}

/**
 * Team + category filter for a game page. Pure links that set `?team=` /
 * `?category=` search params — no client JS, shareable URLs, working back
 * button. The page reads the params and queries accordingly.
 */
export function TeamCategoryFilter({
  slug,
  teams,
  categories,
  activeTeam,
  activeCategory,
}: {
  slug: string;
  teams: Team[];
  categories: Category[];
  activeTeam?: string;
  activeCategory?: string;
}) {
  const href = (params: { team?: string; category?: string }) => {
    const sp = new URLSearchParams();
    if (params.team) sp.set("team", params.team);
    if (params.category) sp.set("category", params.category);
    const qs = sp.toString();
    return `/games/${slug}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-3">
      {teams.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Team
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={href({ category: activeCategory })}
              className={pillClass(!activeTeam)}
            >
              All
            </Link>
            {teams.map((team) => (
              <Link
                key={team.id}
                href={href({ team: team.id, category: activeCategory })}
                className={pillClass(activeTeam === team.id)}
              >
                {team.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Category
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={href({ team: activeTeam })}
              className={pillClass(!activeCategory)}
            >
              All
            </Link>
            {categories.map((category) => (
              <Link
                key={category.id}
                href={href({ team: activeTeam, category: category.id })}
                className={pillClass(activeCategory === category.id)}
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
