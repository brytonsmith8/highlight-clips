import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { formatPrice } from "@/lib/format";
import { COLORS, PRODUCT, SIZES } from "@/lib/merch";

export const metadata: Metadata = {
  title: "Merch",
  description:
    "BRYT VISION one-sleeve compression shirts in black, white, and red.",
};

export default function MerchPage() {
  const href = `/merch/${PRODUCT.slug}`;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-5xl font-extrabold uppercase leading-none tracking-tight">
        Merch
      </h1>
      <p className="mt-3 max-w-prose text-base leading-7 text-muted">
        Wear the vision. All for the glory of God.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-lg border border-border p-4">
          <Link href={href} className="block">
            <div className="relative aspect-square w-full overflow-hidden rounded bg-white">
              <Image
                src={COLORS[0].front}
                alt={`${PRODUCT.name}, black`}
                fill
                sizes="(min-width: 640px) 340px, 100vw"
                className="object-contain"
              />
            </div>
            <h2 className="mt-4 font-semibold">{PRODUCT.name}</h2>
          </Link>
          <p className="mt-1 text-lg font-semibold">
            {formatPrice(PRODUCT.priceCents / 100)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Sizes: {SIZES.map((s) => s.label).join(", ")}
          </p>

          <ul className="mt-3 flex flex-wrap gap-3 text-sm" aria-label="Colors">
            {COLORS.map((color) => (
              <li key={color.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-4 rounded-full border border-border"
                  style={{ backgroundColor: color.swatch }}
                />
                {color.name}
              </li>
            ))}
          </ul>

          <Link
            href={href}
            className="mt-4 block w-full rounded bg-foreground px-3 py-2 text-center text-sm font-semibold uppercase tracking-wide text-white"
          >
            Choose options
          </Link>
        </article>
      </div>
    </div>
  );
}
