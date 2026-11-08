import type { Scripture } from "@/lib/scriptures";

/**
 * The large, high-contrast Scripture display on the purchase confirmation page.
 * Light gold on deep navy (contrast well above WCAG AAA), big bold type that scales from phone to desktop.
 */
export function ScriptureCard({ scripture }: { scripture: Scripture }) {
  return (
    <section
      aria-label="Scripture of the purchase"
      className="relative overflow-hidden rounded-2xl bg-[#0b1220] px-6 py-10 text-center shadow-xl sm:px-12 sm:py-14"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-amber-400" />
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300 sm:text-sm">
        A word of encouragement
      </p>
      <blockquote className="mt-6">
        <p className="font-serif text-2xl font-extrabold leading-snug text-white sm:text-4xl sm:leading-snug">
          &ldquo;{scripture.text}&rdquo;
        </p>
        <footer className="mt-6">
          <cite className="text-xl font-extrabold not-italic tracking-wide text-amber-300 sm:text-3xl">
            {scripture.reference}
          </cite>
          <span className="mt-1 block text-xs font-semibold uppercase tracking-widest text-slate-300">
            King James Version
          </span>
        </footer>
      </blockquote>
    </section>
  );
}
