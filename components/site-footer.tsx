import Image from "next/image";
import Link from "next/link";

const BUILD_SHA = (
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_BUILD_SHA ??
  "dev"
).slice(0, 7);

export function SiteFooter() {
  return (
    <footer className="on-dark border-t-2 border-red-600 bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-white/60">
        <div className="flex items-center gap-4">
          <Image
            src="/brand/bryt-vision-logo.png"
            alt="BRYT VISION"
            width={64}
            height={64}
            className="h-16 w-16 rounded-full"
          />
          <p>All For The Glory Of God</p>
        </div>

        <nav aria-label="Footer" className="mt-4 flex gap-4 text-sm">
          <Link href="/games" className="text-white hover:text-red-500 hover:underline">
            Games
          </Link>
          <Link href="/merch" className="text-white hover:text-red-500 hover:underline">
            Merch
          </Link>
          <Link href="/merch/cart" className="text-white hover:text-red-500 hover:underline">
            Cart
          </Link>
        </nav>

        <p className="mt-6">&copy; {new Date().getFullYear()} Bryt Vision Media.</p>
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
