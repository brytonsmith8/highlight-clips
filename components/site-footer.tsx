const BUILD_SHA = (
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_BUILD_SHA ??
  "dev"
).slice(0, 7);

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-muted">
        <p>&copy; {new Date().getFullYear()} Bryt Vision Media.</p>
        <p className="mt-1">
          Highlight clips are available for a limited time. Purchased downloads
          expire a few days after purchase — download your files promptly.
        </p>
        <p className="mt-1 text-[10px] opacity-70" data-build={BUILD_SHA}>
          build {BUILD_SHA}
        </p>
      </div>
    </footer>
  );
}
