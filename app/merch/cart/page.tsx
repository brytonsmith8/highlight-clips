import type { Metadata } from "next";
import Link from "next/link";

import { CartView } from "@/components/merch/cart-view";

export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/merch" className="text-sm text-accent hover:underline">
        &larr; Keep shopping
      </Link>
      <h1 className="mt-2 font-display text-4xl font-extrabold uppercase leading-none tracking-tight">
        Your cart
      </h1>
      <CartView />
    </div>
  );
}
