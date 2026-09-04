export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-4">
      <section className="py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Bryt Vision Media
        </h1>
        <p className="mt-2 text-lg text-muted">Find Your Highlights.</p>
        <p className="mt-6 max-w-prose text-base leading-7">
          We film local sports and turn the footage into short highlight clips.
          Browse a game, find your plays from a free preview, and buy the clips
          you want in full quality.
        </p>
      </section>

      <section className="border-t border-border py-10">
        <h2 className="text-xl font-semibold tracking-tight">Available games</h2>
        <div className="mt-4 rounded-lg border border-border p-6 text-center text-muted">
          <p>No games are available right now.</p>
          <p className="mt-1 text-sm">
            Check back after the next event — highlights are usually posted
            within a few days.
          </p>
        </div>
      </section>
    </div>
  );
}
