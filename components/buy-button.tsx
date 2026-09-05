"use client";

import { useState } from "react";

import { formatPrice } from "@/lib/format";

/** Posts to /api/checkout and redirects to the returned Stripe Checkout URL. */
export function BuyButton({
  clipId,
  price,
}: {
  clipId: string;
  price: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId }),
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
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="mt-2 w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
      >
        {loading
          ? "Redirecting to checkout…"
          : `Buy · ${formatPrice(price)}`}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
