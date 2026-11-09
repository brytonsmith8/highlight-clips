import Link from "next/link";

import { getGames } from "@/lib/queries";
import { GameCard } from "@/components/game-card";
import { CoinLogo } from "@/components/home/coin-logo";
import { MerchShowcase } from "@/components/home/merch-showcase";
import { VerseBanner } from "@/components/home/verse-card";
import { BUNDLE_MIN_CLIPS, BUNDLE_PRICE_CENTS, INDIVIDUAL_PRICE_CENTS, formatCents } from "@/lib/pricing";

const STEPS = [
  {
    title: "Find your game",
    body: "Pick the game you played in and browse every clip from it.",
  },
  {
    title: "Watch the preview",
    body: "Every clip has a free, lower-quality preview with the BRYT VISION watermark.",
  },
  {
    title: "Buy securely",
    body: "Pay through Stripe Checkout. Only a confirmed payment unlocks your clip.",
  },
  {
    title: "Download the original",
    body: "You get a private link to the full-quality file. Download it before your access window closes.",
  },
] as const;

export default async function HomePage() {
  const games = await getGames(6);

  return (
    <>
      <div className="on-dark hero-bg text-white">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-10 pt-8 md:grid-cols-2 md:gap-10 md:pb-14 md:pt-12">
          <div className="md:order-2">
            <CoinLogo />
          </div>

          <div className="md:order-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-500">
              Sports highlight clips &middot; Faith-based apparel
            </p>
            <h1 className="mt-3 font-display text-7xl font-extrabold uppercase leading-[0.85] tracking-tight sm:text-8xl lg:text-9xl">
              BRYT <span className="text-red-600">VISION</span>
            </h1>
            <p className="mt-3 font-display text-3xl font-bold uppercase tracking-wide sm:text-4xl">
              Find your highlights
            </p>
            <p className="mt-4 max-w-prose text-base leading-7 text-white/80">
              BRYT VISION films sports. Find your game, watch a free preview,
              then buy and download your highlight clips &mdash; and shop
              faith-based athletic apparel. All for the glory of God.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/clips"
                className="rounded bg-red-600 px-8 py-4 text-center text-sm font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(220,38,38,0.8)] transition-colors hover:bg-red-500"
              >
                Find your clips
              </Link>
              <Link
                href="/merch"
                className="rounded border-2 border-white px-8 py-4 text-center text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black"
              >
                Shop the Vision
              </Link>
            </div>
          </div>
        </section>

        <div
          aria-hidden="true"
          className="h-1 w-full bg-gradient-to-r from-transparent via-red-600 to-transparent"
        />

        {/* Game discovery (primary) with the merch preview beside it */}
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 lg:grid-cols-5 lg:gap-10 lg:py-16">
          <section id="games" className="scroll-mt-20 lg:col-span-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-500">
                  Your highlights
                </p>
                <h2 className="mt-1 font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-tight sm:text-6xl">
                  Find your game
                </h2>
              </div>
              {games.length > 0 && (
                <Link
                  href="/games"
                  className="shrink-0 text-sm font-semibold text-red-500 hover:underline"
                >
                  See all games
                </Link>
              )}
            </div>
            <p className="mt-3 max-w-prose text-sm leading-6 text-white/70">
              Pick a game, find your plays, watch the free preview, and buy
              the clips you want.
            </p>
            <p className="mt-3 inline-block rounded border border-red-600/60 bg-red-600/10 px-3 py-2 text-sm font-semibold text-white">
              {formatCents(INDIVIDUAL_PRICE_CENTS)} per clip &middot; Buy {BUNDLE_MIN_CLIPS} or more and every
              clip is just {formatCents(BUNDLE_PRICE_CENTS)}.
            </p>

            {games.length === 0 ? (
              <div className="mt-6 rounded-lg border border-white/15 p-6 text-center text-white/70">
                <p>No games are available right now.</p>
                <p className="mt-1 text-sm">
                  Check back after the next event — highlights are usually
                  posted within a few days.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {games.map((game) => (
                  <GameCard key={game.id} game={game} tone="dark" />
                ))}
              </div>
            )}
          </section>

          <section aria-label="Merch" className="lg:col-span-2">
            <MerchShowcase />
          </section>
        </div>

      </div>

      {/* Brand verse: large and bold, full width. */}
      <VerseBanner />

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-lg font-semibold tracking-tight">
          How buying a clip works
        </h2>
        <ol className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <p className="font-display text-3xl font-extrabold leading-none text-red-600">
                {index + 1}
              </p>
              <p className="mt-2 font-medium">{step.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
