import type { Metadata } from "next";
import Link from "next/link";

import { ProductPicker } from "@/components/merch/product-picker";
import { COLORS, PRODUCT, type ColorId } from "@/lib/merch";

export const metadata: Metadata = {
  title: PRODUCT.name,
  description: PRODUCT.description,
};

export default async function ProductPage({
  searchParams,
}: {
  searchParams: Promise<{ color?: string | string[] }>;
}) {
  const raw = (await searchParams).color;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const initialColor: ColorId =
    COLORS.find((c) => c.id === value)?.id ?? "black";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/merch" className="text-sm text-accent hover:underline">
        &larr; Merch
      </Link>
      <div className="mt-4">
        <ProductPicker initialColor={initialColor} />
      </div>
    </div>
  );
}
