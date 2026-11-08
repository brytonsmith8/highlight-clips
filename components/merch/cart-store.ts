"use client";

import { useSyncExternalStore } from "react";

import {
  MAX_LINES,
  MAX_QTY,
  lineKey,
  parseLine,
  type CartLine,
} from "@/lib/merch";

/**
 * Tiny browser-side cart kept in localStorage. It only remembers WHAT the
 * shopper picked (color/size/sleeve/qty); prices are never stored here and
 * are always recomputed on the server at checkout.
 */
const STORAGE_KEY = "bryt-merch-cart-v1";
const EMPTY: CartLine[] = [];

let cache: CartLine[] | null = null;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed
      .map(parseLine)
      .filter((l): l is CartLine => l !== null)
      .slice(0, MAX_LINES);
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): CartLine[] {
  if (cache === null) cache = read();
  return cache;
}

function write(next: CartLine[]) {
  cache = next.length === 0 ? EMPTY : next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode etc.): the cart still works this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      cache = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/** Returns false when the cart is full of other distinct lines. */
export function addToCart(line: CartLine): boolean {
  const current = getSnapshot();
  const key = lineKey(line);
  const existing = current.find((l) => lineKey(l) === key);
  if (existing) {
    write(
      current.map((l) =>
        l === existing ? { ...l, qty: Math.min(MAX_QTY, l.qty + line.qty) } : l,
      ),
    );
    return true;
  }
  if (current.length >= MAX_LINES) return false;
  write([...current, { ...line, qty: Math.min(MAX_QTY, line.qty) }]);
  return true;
}

export function setQty(key: string, qty: number) {
  const next = Math.max(1, Math.min(MAX_QTY, Math.floor(qty)));
  write(getSnapshot().map((l) => (lineKey(l) === key ? { ...l, qty: next } : l)));
}

export function removeLine(key: string) {
  write(getSnapshot().filter((l) => lineKey(l) !== key));
}

export function clearCart() {
  write([]);
}
