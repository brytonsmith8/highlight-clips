"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { formatPrice } from "@/lib/format";
import {
  COLORS,
  PRODUCT,
  SIZES,
  defaultSleeveFor,
  getColor,
  getSize,
  isSoldOut,
  sleeveLabel,
  type ColorId,
  type Handedness,
  type SizeId,
  type Sleeve,
} from "@/lib/merch";
import { addToCart } from "./cart-store";

const optionBase =
  "cursor-pointer rounded border px-3 py-2 text-sm font-medium transition-colors has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent border-border";

export function ProductPicker({ initialColor = "black" }: { initialColor?: ColorId }) {
  const [colorId, setColorId] = useState<ColorId>(initialColor);
  const [view, setView] = useState<"front" | "back">("front");
  const [size, setSize] = useState<SizeId | null>(null);
  const [hand, setHand] = useState<Handedness | null>(null);
  const [sleeveOverride, setSleeveOverride] = useState<Sleeve | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [full, setFull] = useState(false);

  const color = getColor(colorId);
  const sleeve: Sleeve | null = hand ? (sleeveOverride ?? defaultSleeveFor(hand)) : null;
  const ready = size !== null && sleeve !== null && !isSoldOut(colorId, size);

  function onAdd() {
    if (!size || !sleeve) return;
    const ok = addToCart({ color: colorId, size, sleeve, qty });
    setFull(!ok);
    setAdded(ok);
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Gallery */}
      <div>
        <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-white">
          <Image
            key={`${colorId}-${view}`}
            src={view === "front" ? color.front : color.back}
            alt={`${color.name} ${PRODUCT.name}, ${view} view`}
            fill
            priority
            sizes="(min-width: 768px) 480px, 100vw"
            className="object-contain"
          />
        </div>
        <div className="mt-3 flex gap-2" role="group" aria-label="Photo view">
          {(["front", "back"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`relative h-20 w-20 overflow-hidden rounded border bg-white ${
                view === v ? "border-foreground" : "border-border"
              }`}
            >
              <Image
                src={v === "front" ? color.front : color.back}
                alt={`${color.name}, ${v} view`}
                fill
                sizes="80px"
                className="object-contain"
              />
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Photos show the left-sleeve version. The right-sleeve version is the
          same shirt with the sleeve on the other side.
        </p>
      </div>

      {/* Options */}
      <div>
        <h1 className="font-display text-4xl font-extrabold uppercase leading-none tracking-tight">
          {PRODUCT.name}
        </h1>
        <p className="mt-2 text-2xl font-semibold">{formatPrice(PRODUCT.priceCents / 100)}</p>
        <p className="mt-3 text-sm leading-6 text-muted">{PRODUCT.description}</p>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">
            Color: <span className="font-normal">{color.name}</span>
          </legend>
          <div className="mt-2 flex gap-3">
            {COLORS.map((c) => (
              <label
                key={c.id}
                className="cursor-pointer rounded-full has-[:checked]:ring-2 has-[:checked]:ring-foreground has-[:checked]:ring-offset-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-accent"
              >
                <input
                  type="radio"
                  name="color"
                  value={c.id}
                  checked={colorId === c.id}
                  onChange={() => {
                    setColorId(c.id);
                    setAdded(false);
                  }}
                  className="sr-only"
                />
                <span className="sr-only">{c.name}</span>
                <span
                  aria-hidden="true"
                  className="block h-9 w-9 rounded-full border border-border"
                  style={{ backgroundColor: c.swatch }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">Size</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SIZES.map((s) => {
              const out = isSoldOut(colorId, s.id);
              return (
                <label key={s.id} className={optionBase}>
                  <input
                    type="radio"
                    name="size"
                    value={s.id}
                    checked={size === s.id}
                    disabled={out}
                    onChange={() => {
                      setSize(s.id);
                      setAdded(false);
                    }}
                    className="sr-only"
                  />
                  {s.label}
                  {out ? " (sold out)" : ""}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">Which hand do you write/throw with?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["right", "Right-handed"],
                ["left", "Left-handed"],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className={optionBase}>
                <input
                  type="radio"
                  name="hand"
                  value={id}
                  checked={hand === id}
                  onChange={() => {
                    setHand(id);
                    setSleeveOverride(null);
                    setAdded(false);
                  }}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Right-handed shirts come with a left sleeve. Left-handed shirts come
            with a right sleeve.
          </p>
        </fieldset>

        {sleeve && hand && (
          <fieldset className="mt-6">
            <legend className="text-sm font-semibold">Sleeve side</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["left", "right"] as const).map((s) => (
                <label key={s} className={optionBase}>
                  <input
                    type="radio"
                    name="sleeve"
                    value={s}
                    checked={sleeve === s}
                    onChange={() => {
                      setSleeveOverride(s === defaultSleeveFor(hand) ? null : s);
                      setAdded(false);
                    }}
                    className="sr-only"
                  />
                  {sleeveLabel(s)}
                  {s === defaultSleeveFor(hand) ? " (recommended)" : ""}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div
          className="mt-6 rounded-lg border border-border bg-zinc-50 p-4 text-sm"
          aria-live="polite"
        >
          <p className="font-semibold">Your shirt</p>
          <p className="mt-1">
            {color.name} &middot; {size ? getSize(size).label : "choose a size"} &middot;{" "}
            {sleeve ? (
              <strong>{sleeveLabel(sleeve)}</strong>
            ) : (
              "choose handedness to set the sleeve side"
            )}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className="text-sm font-semibold" htmlFor="qty">
            Qty
          </label>
          <select
            id="qty"
            value={qty}
            onChange={(e) => {
              setQty(Number(e.target.value));
              setAdded(false);
            }}
            className="rounded border border-border px-2 py-2 text-sm"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onAdd}
          disabled={!ready}
          className="mt-4 w-full rounded bg-foreground px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-opacity disabled:opacity-40"
        >
          {ready ? "Add to cart" : "Choose size and handedness"}
        </button>

        {added && (
          <p className="mt-3 text-sm" role="status">
            Added to cart.{" "}
            <Link href="/merch/cart" className="font-semibold underline">
              View cart &amp; check out
            </Link>
          </p>
        )}
        {full && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            Your cart is full. Check out first, then order more.
          </p>
        )}
        <p className="mt-4 text-xs text-muted">
          Ships within the United States. Shipping and any taxes are shown at
          checkout before you pay.
        </p>
      </div>
    </div>
  );
}
