"use client";

import Link from "next/link";

import { cartCount, useCart } from "./cart-store";

/** Header cart link with a live item count. */
export function CartLink() {
  const count = cartCount(useCart());
  return (
    <Link
      href="/merch/cart"
      className="rounded px-3 py-2 transition-colors hover:bg-white/10 hover:text-red-500"
      aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
    >
      Cart
      {count > 0 && (
        <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-5 text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
