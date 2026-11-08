"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  BUNDLE_MIN_CLIPS,
  BUNDLE_PRICE_CENTS,
  MAX_CLIPS_PER_ORDER,
  clipsToBundle,
  formatCents,
  priceForCount,
} from "@/lib/pricing";

interface SelectionContextValue {
  selected: ReadonlySet<string>;
  toggle: (clipId: string) => void;
  clear: () => void;
  atLimit: boolean;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("Clip selection components must be inside <SelectionProvider>.");
  return ctx;
}

const storageKey = (gameId: string) => `bryt-cart:${gameId}`;

/**
 * Holds the clips a customer has ticked on one game page. Kept in sessionStorage (best effort)
 * so switching the athlete filter, which reloads the list, doesn't lose the selection.
 * Nothing here is trusted by the server: checkout re-validates and re-prices every clip.
 */
export function SelectionProvider({ gameId, children }: { gameId: string; children: ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(gameId));
      const ids = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(ids)) {
        // Restoring a saved selection from sessionStorage after mount (not readable during server render).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelected(new Set(ids.filter((x): x is string => typeof x === "string").slice(0, MAX_CLIPS_PER_ORDER)));
      }
    } catch {
      // storage unavailable: start empty
    }
  }, [gameId]);

  const save = useCallback(
    (next: Set<string>) => {
      try {
        sessionStorage.setItem(storageKey(gameId), JSON.stringify([...next]));
      } catch {
        // ignore
      }
    },
    [gameId],
  );

  const toggle = useCallback(
    (clipId: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(clipId)) next.delete(clipId);
        else if (next.size < MAX_CLIPS_PER_ORDER) next.add(clipId);
        save(next);
        return next;
      });
    },
    [save],
  );

  const clear = useCallback(() => {
    const next = new Set<string>();
    setSelected(next);
    save(next);
  }, [save]);

  const value = useMemo(
    () => ({ selected, toggle, clear, atLimit: selected.size >= MAX_CLIPS_PER_ORDER }),
    [selected, toggle, clear],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** Wraps one clip card with a clearly visible select / deselect control. */
export function SelectableClip({ clipId, children }: { clipId: string; children: ReactNode }) {
  const { selected, toggle, atLimit } = useSelection();
  const isSelected = selected.has(clipId);
  const blocked = !isSelected && atLimit;

  return (
    <div
      className={
        "relative rounded-lg transition-shadow " +
        (isSelected ? "ring-2 ring-accent ring-offset-2" : "")
      }
      data-selected={isSelected ? "true" : "false"}
    >
      <label
        className={
          "absolute right-5 top-5 z-10 flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold shadow " +
          (isSelected ? "bg-accent text-white" : "bg-white text-foreground") +
          (blocked ? " cursor-not-allowed opacity-60" : "")
        }
      >
        <input
          type="checkbox"
          checked={isSelected}
          disabled={blocked}
          onChange={() => toggle(clipId)}
          className="h-4 w-4 accent-current"
          aria-label={isSelected ? "Remove this clip from your purchase" : "Add this clip to your purchase"}
        />
        {isSelected ? "Selected" : "Select"}
      </label>
      {children}
    </div>
  );
}

/** Live purchase summary + checkout button. */
export function CartSummary() {
  const { selected, clear } = useSelection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = priceForCount(selected.size);
  const more = clipsToBundle(selected.size);

  async function checkout() {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipIds: [...selected] }),
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
    <aside
      aria-label="Your purchase"
      className="sticky bottom-3 z-20 mt-8 rounded-xl border-2 border-accent bg-white p-4 shadow-lg"
    >
      <p
        className={
          "text-sm font-semibold " + (price.bundleApplied ? "text-green-700" : "text-accent")
        }
      >
        {price.bundleApplied
          ? `Bundle price unlocked! Every clip is ${formatCents(BUNDLE_PRICE_CENTS)}.`
          : `Select ${BUNDLE_MIN_CLIPS} or more highlights and save! Get every clip for just ${formatCents(BUNDLE_PRICE_CENTS)} each.`}
        {!price.bundleApplied && selected.size > 0 && (
          <span className="font-normal text-muted">
            {" "}
            Add {more} more clip{more === 1 ? "" : "s"} to unlock it.
          </span>
        )}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Selected clips</dt>
        <dd className="text-right font-semibold" data-testid="cart-count">
          {price.count}
        </dd>
        <dt className="text-muted">Original price</dt>
        <dd className="text-right" data-testid="cart-original">
          {formatCents(price.originalCents)}
        </dd>
        <dt className="text-muted">Bundle discount</dt>
        <dd className="text-right text-green-700" data-testid="cart-discount">
          {price.savingsCents > 0 ? `−${formatCents(price.savingsCents)}` : formatCents(0)}
        </dd>
        <dt className="text-muted">Total savings</dt>
        <dd className="text-right text-green-700" data-testid="cart-savings">
          {formatCents(price.savingsCents)}
        </dd>
        <dt className="border-t border-border pt-1 text-base font-bold">Final price</dt>
        <dd className="border-t border-border pt-1 text-right text-base font-bold" data-testid="cart-total">
          {formatCents(price.totalCents)}
        </dd>
      </dl>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={checkout}
          disabled={loading || selected.size === 0}
          className="flex-1 rounded bg-accent px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-50"
        >
          {loading
            ? "Redirecting to checkout…"
            : selected.size === 0
              ? "Select clips to check out"
              : `Checkout · ${price.count} clip${price.count === 1 ? "" : "s"} · ${formatCents(price.totalCents)}`}
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={clear}
            disabled={loading}
            className="rounded border border-border px-3 py-3 text-sm"
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </aside>
  );
}
