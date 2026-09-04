import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
        <Link href="/" className="flex flex-col leading-none">
          <span className="text-base font-bold tracking-tight">
            Bryt Vision Media
          </span>
          <span className="text-xs text-muted">Find Your Highlights.</span>
        </Link>
      </div>
    </header>
  );
}
