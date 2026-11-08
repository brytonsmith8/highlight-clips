/**
 * Merch catalog + validation. Shared by server and client code.
 *
 * The catalog lives in code on purpose: it needs no database migration, and
 * the checkout API re-derives every price from here, so a browser can never
 * choose its own price.
 */

export type ColorId = "black" | "white" | "red";
export type SizeId = "S" | "M" | "L";
export type Sleeve = "left" | "right";
export type Handedness = "right" | "left";

export const PRODUCT = {
  slug: "one-sleeve-compression-shirt",
  name: "One-Sleeve Compression Shirt",
  brandedName: "BRYT VISION One-Sleeve Compression Shirt",
  /** Price per shirt in cents. */
  priceCents: 4000,
  description:
    "A one-sleeve compression shirt with the BRYT VISION logo on the chest, a cross on the back, and logo trim along the sleeve opening.",
} as const;

/**
 * OWNER DECISION NEEDED: flat US shipping per order, in cents.
 * 0 means free shipping. Change this one number to charge for shipping.
 */
export const SHIPPING_CENTS = 0;

export const SIZES: ReadonlyArray<{ id: SizeId; label: string }> = [
  { id: "S", label: "Small" },
  { id: "M", label: "Medium" },
  { id: "L", label: "Large" },
];

export const COLORS: ReadonlyArray<{
  id: ColorId;
  name: string;
  swatch: string;
  front: string;
  back: string;
}> = [
  {
    id: "black",
    name: "Black",
    swatch: "#0a0a0a",
    front: "/merch/black-front.webp",
    back: "/merch/black-back.webp",
  },
  {
    id: "white",
    name: "White",
    swatch: "#ffffff",
    front: "/merch/white-front.webp",
    back: "/merch/white-back.webp",
  },
  {
    id: "red",
    name: "Red",
    swatch: "#b3322a",
    front: "/merch/red-front.webp",
    back: "/merch/red-back.webp",
  },
];

/**
 * Variants that are currently sold out, as "color-size" keys (e.g. "red-L").
 * Empty: no stock counts are tracked or claimed. Add a key to block a variant
 * in both the shop and the checkout API.
 */
export const SOLD_OUT: ReadonlySet<string> = new Set<string>();

export const MAX_QTY = 10;
export const MAX_LINES = 12;

export interface CartLine {
  color: ColorId;
  size: SizeId;
  sleeve: Sleeve;
  qty: number;
}

export function defaultSleeveFor(hand: Handedness): Sleeve {
  // Right-handed -> left sleeve. Left-handed -> right sleeve.
  return hand === "right" ? "left" : "right";
}

export function sleeveLabel(sleeve: Sleeve): string {
  return sleeve === "left" ? "Left sleeve" : "Right sleeve";
}

export function getColor(id: ColorId) {
  return COLORS.find((c) => c.id === id)!;
}

export function getSize(id: SizeId) {
  return SIZES.find((s) => s.id === id)!;
}

export function isSoldOut(color: ColorId, size: SizeId): boolean {
  return SOLD_OUT.has(`${color}-${size}`);
}

export function lineKey(line: Pick<CartLine, "color" | "size" | "sleeve">): string {
  return `${line.color}-${line.size}-${line.sleeve}`;
}

export function lineDescription(line: Pick<CartLine, "color" | "size" | "sleeve">): string {
  return `${PRODUCT.brandedName} — ${getColor(line.color).name}, ${getSize(line.size).label}, ${sleeveLabel(line.sleeve)}`;
}

/** Returns a clean CartLine, or null when the input is not a valid, buyable line. */
export function parseLine(input: unknown): CartLine | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  const color = COLORS.find((c) => c.id === o.color)?.id;
  const size = SIZES.find((s) => s.id === o.size)?.id;
  const sleeve =
    o.sleeve === "left" || o.sleeve === "right" ? (o.sleeve as Sleeve) : null;
  const qty = typeof o.qty === "number" ? Math.floor(o.qty) : NaN;
  if (!color || !size || !sleeve) return null;
  if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY) return null;
  return { color, size, sleeve, qty };
}
