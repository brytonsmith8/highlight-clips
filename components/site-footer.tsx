export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-muted">
        <p>&copy; {new Date().getFullYear()} Bryt Vision Media.</p>
        <p className="mt-1">
          Highlight clips are available for a limited time. Purchased downloads
          expire a few days after purchase — download your files promptly.
        </p>
      </div>
    </footer>
  );
}
