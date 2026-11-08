import Image from "next/image";
import Link from "next/link";

import { formatPrice } from "@/lib/format";
import { COLORS, PRODUCT } from "@/lib/merch";

/**
 * Compact merch preview: three equal cards (real photos, front + back),
 * price, sizes, and a link to the product page with that color selected.
 * Sits beside game discovery on desktop and below it on mobile.
 */
export function MerchShowcase() {
  return (
    <div id="merch" className="scroll-mt-20">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-500">
        BRYT VISION Apparel
      </p>
      <h2 className="mt-1 font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-tight sm:text-6xl">
        Shop <span className="text-red-600">the</span> Vision
      </h2>
      <p className="mt-3 text-sm leading-6 text-white/70">
        One-sleeve compression shirt &middot;{" "}
        <strong className="text-white">{formatPrice(PRODUCT.priceCents / 100)}</strong>{" "}
        &middot; Sizes Small, Medium, Large &middot; Left or right sleeve.
      </p>

      <ul className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        {COLORS.map((color) => (
          <li key={color.id} className="min-w-0">
            <Link
              href={`/merch/${PRODUCT.slug}?color=${color.id}`}
              className="group flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900 transition-all duration-300 hover:-translate-y-1 hover:border-red-600/70 hover:shadow-[0_14px_30px_-10px_rgba(220,38,38,0.5)]"
            >
              <div className="relative aspect-square w-full bg-white">
                <Image
                  src={color.front}
                  alt={`${color.name} one-sleeve compression shirt, front`}
                  fill
                  sizes="(min-width: 1024px) 140px, 30vw"
                  className="object-contain transition-opacity duration-300 group-hover:opacity-0"
                />
                <Image
                  src={color.back}
                  alt=""
                  aria-hidden="true"
                  fill
                  sizes="(min-width: 1024px) 140px, 30vw"
                  className="object-contain opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
                <div className="absolute bottom-1 right-1 h-9 w-9 overflow-hidden rounded border border-black/15 bg-white shadow sm:h-11 sm:w-11">
                  <Image
                    src={color.back}
                    alt={`${color.name} shirt, back with cross`}
                    fill
                    sizes="44px"
                    className="object-contain"
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                <p className="font-display text-xl font-extrabold uppercase leading-none sm:text-2xl">
                  {color.name}
                </p>
                <p className="mt-1 text-xs text-white/65">
                  {formatPrice(PRODUCT.priceCents / 100)}
                </p>
                <span className="mt-2 text-xs font-bold uppercase tracking-wider text-red-500 transition-transform duration-300 group-hover:translate-x-0.5">
                  Shop &rarr;
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-5 text-white/60">
        BRYT VISION logo on the chest &middot; large cross on the back &middot;
        branded trim on the sleeve opening.
      </p>

      <Link
        href="/merch"
        className="mt-5 block rounded bg-red-600 px-6 py-3.5 text-center text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-red-500"
      >
        Shop the collection
      </Link>
    </div>
  );
}
