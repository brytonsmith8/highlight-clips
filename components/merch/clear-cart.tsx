"use client";

import { useEffect } from "react";

import { clearCart } from "./cart-store";

/** Empties the browser cart once a paid order is confirmed. Renders nothing. */
export function ClearCart() {
  useEffect(() => {
    clearCart();
  }, []);
  return null;
}
