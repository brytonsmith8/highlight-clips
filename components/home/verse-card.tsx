/**
 * The brand verse, Psalm 71:18 (KJV — public domain). Rendered once per
 * placement; callers hide the copy they don't want at a given breakpoint
 * with `display: none`, which also removes it from the accessibility tree.
 */
export function VerseCard({ className = "" }: { className?: string }) {
  return (
    <figure
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6 ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-3 right-4 select-none font-display text-8xl font-extrabold leading-none text-red-600/25"
      >
        &rdquo;
      </span>
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-red-500">
        Our verse
      </p>
      <blockquote className="mt-3 text-base leading-7 text-white/90 sm:text-[17px]">
        &ldquo;Now also when I am old and greyheaded, O God, forsake me not;
        until I have shewed thy strength unto{" "}
        <strong className="font-bold uppercase tracking-wide text-red-500">
          this generation
        </strong>
        , and thy power to every one that is to come.&rdquo;
      </blockquote>
      <figcaption className="mt-3 text-xs font-semibold uppercase tracking-widest text-white/60">
        Psalm 71:18 &middot; KJV
      </figcaption>
    </figure>
  );
}

/**
 * Full-width brand verse band: Psalm 71:18 (KJV) in large, bold type on BRYT VISION red.
 * White on this red is above WCAG AA for large text; the reference sits directly underneath.
 */
export function VerseBanner() {
  return (
    <section
      aria-label="Our verse, Psalm 71:18"
      className="on-dark relative overflow-hidden bg-red-700 text-white"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(60%_90%_at_50%_0%,rgba(255,255,255,0.14),transparent_70%)]" />
      <figure className="relative mx-auto max-w-4xl px-5 py-14 text-center sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-white/80 sm:text-sm">
          Our verse
        </p>
        <blockquote className="mt-5 font-display text-3xl font-bold leading-[1.15] sm:text-5xl sm:leading-[1.1] lg:text-6xl">
          &ldquo;Now also when I am old and greyheaded, O God, forsake me not;
          until I have shewed thy strength unto{" "}
          <span className="uppercase underline decoration-white/70 decoration-4 underline-offset-8">
            this generation
          </span>
          , and thy power to every one that is to come.&rdquo;
        </blockquote>
        <figcaption className="mt-7 font-display text-2xl font-extrabold uppercase tracking-[0.2em] sm:text-3xl">
          Psalm 71:18
          <span className="ml-3 align-middle text-xs font-semibold tracking-[0.25em] text-white/80">
            KJV
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
