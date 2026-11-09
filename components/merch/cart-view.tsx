"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { formatPrice } from "@/lib/format";
import {
  MAX_QTY,
  PRODUCT,
  getColor,
  getSize,
  lineKey,
  sleeveLabel,
} from "@/lib/merch";
import { cartCount, removeLine, setQty, useCart } from "./cart-store";

export function CartView() {
  const lines = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lines.length === 0) {
    return (
      <div className="mt-6">
        <p className="text-muted">Your cart is empty.</p>
        <Link
          href="/merch/one-sleeve-compression-shirt"
          className="mt-4 inline-block rounded bg-foreground px-4 py-2 text-sm font-semibold text-white"
        >
          Shop the shirt
        </Link>
      </div>
    );
  }

  const subtotal = (cartCount(lines) * PRODUCT.priceCents) / 100;

  async function checkout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/merch/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <p className="rounded border border-border bg-zinc-50 p-3 text-sm">
        Please confirm the <strong>sleeve side</strong> on each shirt before you
        check out.
      </p>

      <ul className="mt-4 divide-y divide-border border-y border-border">
        {lines.map((line) => {
          const key = lineKey(line);
          const color = getColor(line.color);
          return (
            <li key={key} className="flex gap-4 py-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded border border-border bg-white">
                <Image
                  src={color.front}
                  alt={`${color.name} shirt`}
                  fill
                  sizes="96px"
                  className="object-contain"
                />
              </div>
              <div className="flex-1 text-sm">
                <p className="font-semibold">{PRODUCT.name}</p>
                <p className="text-muted">
                  {color.name} &middot; {getSize(line.size).label}
                </p>
                <p className="mt-0.5 font-semibold">{sleeveLabel(line.sleeve)}</p>
                <div className="mt-2 flex items-center gap-3">
                  <label className="sr-only" htmlFor={`qty-${key}`}>
                    Quantity
                  </label>
                  <select
                    id={`qty-${key}`}
                    value={line.qty}
                    onChange={(e) => setQty(key, Number(e.target.value))}
                    className="rounded border border-border px-2 py-1"
                  >
                    {Array.from({ length: MAX_QTY }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeLine(key)}
                    className="text-xs text-muted underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="text-sm font-semibold">
                {formatPrice((line.qty * PRODUCT.priceCents) / 100)}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span>Subtotal</span>
        <span className="text-lg font-semibold">{formatPrice(subtotal)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Shipping (US only) and any taxes are shown at checkout before you pay.
      </p>

      <button
        type="button"
        onClick={checkout}
        disabled={loading}
        className="mt-5 w-full rounded bg-foreground px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-60"
      >
        {loading ? "Redirecting to checkout…" : "Check out"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
