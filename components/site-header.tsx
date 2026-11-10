import Image from "next/image";
import Link from "next/link";

import { CartLink } from "@/components/merch/cart-link";

const NAV = [
  { href: "/clips", label: "Find Clips" },
  { href: "/merch", label: "Merch" },
] as const;

export function SiteHeader() {
  return (
    <header className="on-dark sticky top-0 z-40 border-b-2 border-red-600 bg-black/95 text-white backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
        <Link
          href="/"
          aria-label="BRYT VISION home"
          className="flex items-center gap-3"
        >
          <Image
            src="/brand/bryt-vision-logo.png"
            alt=""
            width={48}
            height={48}
            priority
            className="h-12 w-12 rounded-full ring-1 ring-white/25"
          />
          <span className="hidden leading-none min-[430px]:block">
            <span className="block font-display text-2xl font-extrabold uppercase tracking-wide">
              BRYT <span className="text-red-600">VISION</span>
            </span>
            <span className="mt-0.5 hidden text-[10px] uppercase tracking-[0.25em] text-white/60 sm:block">
              All For The Glory Of God
            </span>
          </span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-semibold uppercase tracking-wider">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 transition-colors hover:bg-white/10 hover:text-red-500"
            >
              {item.label}
            </Link>
          ))}
          <CartLink />
        </nav>
      </div>
    </header>
  );
}
