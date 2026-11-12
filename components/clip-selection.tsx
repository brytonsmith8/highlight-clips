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
import {
  EDIT_MIN_CLIPS,
  EDIT_PRICE_CENTS,
  countByAthlete,
  editEligibility,
  orderTotals,
} from "@/lib/edit-offer";
import { COLORS, SIZES, isSoldOut, type ColorId, type SizeId, type Sleeve } from "@/lib/merch";

/** One ticked clip. `athleteId` is the athlete PROFILE id (never a jersey number); null when unknown. */
export interface CartEntry {
  id: string;
  gameId: string;
  athleteId: string | null;
  athleteLabel: string | null;
}

interface Shirt {
  size: SizeId | "";
  color: ColorId | "";
  sleeve: Sleeve;
}

interface SelectionContextValue {
  entries: readonly CartEntry[];
  selected: ReadonlySet<string>;
  toggle: (entry: CartEntry) => void;
  clear: () => void;
  atLimit: boolean;
  editAdded: boolean;
  setEditAdded: (v: boolean) => void;
  editAthleteId: string | null;
  setEditAthleteId: (id: string | null) => void;
  shirt: Shirt;
  setShirt: (patch: Partial<Shirt>) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("Clip selection components must be inside <SelectionProvider>.");
  return ctx;
}

/** One cart for the whole site, so clips from different games can be bought together. */
const STORAGE_KEY = "bryt-cart-v2";

function parseEntries(raw: unknown): CartEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CartEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string") continue;
    out.push({
      id: o.id,
      gameId: typeof o.gameId === "string" ? o.gameId : "",
      athleteId: typeof o.athleteId === "string" ? o.athleteId : null,
      athleteLabel: typeof o.athleteLabel === "string" ? o.athleteLabel : null,
    });
  }
  return out.slice(0, MAX_CLIPS_PER_ORDER);
}

/**
 * Holds the clips a customer has ticked (and the optional BRYT VISION EDIT choices). Kept in sessionStorage
 * (best effort) so moving between pages or filters doesn't lose the selection.
 * Nothing here is trusted by the server: checkout re-validates and re-prices every clip and re-checks the
 * athlete qualification itself.
 */
export function SelectionProvider({ children }: { gameId?: string; children: ReactNode }) {
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [editAdded, setEditAddedState] = useState(false);
  const [editAthleteId, setEditAthleteId] = useState<string | null>(null);
  const [shirt, setShirtState] = useState<Shirt>({ size: "", color: "", sleeve: "left" });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { entries?: unknown; editAdded?: unknown };
        // Restoring a saved selection from sessionStorage after mount (not readable during server render).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEntries(parseEntries(parsed.entries));
        setEditAddedState(parsed.editAdded === true);
      }
    } catch {
      // storage unavailable: start empty
    }
  }, []);

  const persist = useCallback((next: CartEntry[], edit: boolean) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: next, editAdded: edit }));
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(
    (entry: CartEntry) => {
      setEntries((prev) => {
        const has = prev.some((e) => e.id === entry.id);
        const next = has
          ? prev.filter((e) => e.id !== entry.id)
          : prev.length < MAX_CLIPS_PER_ORDER
            ? [...prev, entry]
            : prev;
        persist(next, editAdded);
        return next;
      });
    },
    [persist, editAdded],
  );

  const clear = useCallback(() => {
    setEntries([]);
    setEditAddedState(false);
    persist([], false);
  }, [persist]);

  const setEditAdded = useCallback(
    (v: boolean) => {
      setEditAddedState(v);
      persist(entries, v);
    },
    [persist, entries],
  );

  const setShirt = useCallback((patch: Partial<Shirt>) => setShirtState((s) => ({ ...s, ...patch })), []);

  const value = useMemo<SelectionContextValue>(
    () => ({
      entries,
      selected: new Set(entries.map((e) => e.id)),
      toggle,
      clear,
      atLimit: entries.length >= MAX_CLIPS_PER_ORDER,
      editAdded,
      setEditAdded,
      editAthleteId,
      setEditAthleteId,
      shirt,
      setShirt,
    }),
    [entries, toggle, clear, editAdded, setEditAdded, editAthleteId, shirt, setShirt],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** Wraps one clip card with a clearly visible select / deselect control. */
export function SelectableClip({
  clipId,
  gameId,
  athleteId = null,
  athleteLabel = null,
  children,
}: {
  clipId: string;
  gameId: string;
  athleteId?: string | null;
  athleteLabel?: string | null;
  children: ReactNode;
}) {
  const { selected, toggle, atLimit } = useSelection();
  const isSelected = selected.has(clipId);
  const blocked = !isSelected && atLimit;

  return (
    <div
      className={
        "relative rounded-lg transition-shadow " +
        (isSelected ? "ring-2 ring-accent ring-offset-2 ring-offset-transparent" : "")
      }
      data-selected={isSelected ? "true" : "false"}
    >
      <label
        className={
          "absolute right-5 top-5 z-10 flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold shadow " +
          (isSelected ? "bg-accent text-white" : "bg-white text-black") +
          (blocked ? " cursor-not-allowed opacity-60" : "")
        }
      >
        <input
          type="checkbox"
          checked={isSelected}
          disabled={blocked}
          onChange={() => toggle({ id: clipId, gameId, athleteId, athleteLabel })}
          className="h-4 w-4 accent-current"
          aria-label={isSelected ? "Remove this clip from your purchase" : "Add this clip to your purchase"}
        />
        {isSelected ? "Selected" : "Select"}
      </label>
      {children}
    </div>
  );
}

/** Live purchase summary, the BRYT VISION EDIT offer, and the checkout button. */
export function CartSummary() {
  const {
    entries,
    clear,
    editAdded,
    setEditAdded,
    editAthleteId,
    setEditAthleteId,
    shirt,
    setShirt,
  } = useSelection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = entries.length;
  const price = priceForCount(count);
  const more = clipsToBundle(count);

  // ---- BRYT VISION EDIT: qualification is recomputed from the CURRENT selection every render ----------
  const elig = editEligibility(entries.map((e) => ({ athleteId: e.athleteId })));
  const labelOf = (id: string | null) =>
    (id && entries.find((e) => e.athleteId === id)?.athleteLabel) || "this athlete";
  const effectiveAthlete =
    editAthleteId && elig.qualifying.includes(editAthleteId) ? editAthleteId : (elig.qualifying[0] ?? null);
  const editActive = editAdded && elig.unlocked && effectiveAthlete !== null;
  const lostQualification = editAdded && !elig.unlocked;
  const totals = orderTotals(count, editActive);
  const shirtReady =
    !!shirt.size && !!shirt.color && !isSoldOut(shirt.color as ColorId, shirt.size as SizeId);
  const canCheckout = count > 0 && !loading && (!editActive || shirtReady);
  const bestCount = countByAthlete(entries.map((e) => ({ athleteId: e.athleteId }))).get(elig.bestAthleteId ?? "") ?? 0;

  async function checkout() {
    if (!canCheckout) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipIds: entries.map((e) => e.id),
          ...(editActive
            ? {
                edit: {
                  athleteId: effectiveAthlete,
                  size: shirt.size,
                  color: shirt.color,
                  sleeve: shirt.sleeve,
                },
              }
            : {}),
        }),
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

  const offer = (
    <section
      aria-label="BRYT VISION EDIT offer"
      className="mt-2 rounded-lg border border-red-600 bg-black p-2 text-white sm:p-3"
      data-testid="edit-offer"
    >
      <p className="font-display text-base font-extrabold uppercase leading-tight tracking-wide sm:text-lg">
        Got {EDIT_MIN_CLIPS}+ highlights? <span className="text-red-500">Add a {formatCents(EDIT_PRICE_CENTS)} BRYT VISION EDIT + FREE shirt</span>
      </p>
      <details className="mt-1 text-xs text-white/75">
        <summary className="cursor-pointer text-white/90 underline underline-offset-2">What&apos;s included</summary>
        <p className="mt-1">
          A professionally edited highlight video (about 10–35+ seconds, full resolution, ready in about 5–7 days)
          and a FREE one-sleeve compression shirt.
        </p>
      </details>

      {editActive ? (
        <div className="mt-3 space-y-2" data-testid="edit-added">
          <p className="text-sm font-semibold text-green-400">
            Added for {labelOf(effectiveAthlete)} &middot; {formatCents(EDIT_PRICE_CENTS)}
          </p>

          {elig.qualifying.length > 1 && (
            <label className="block text-xs text-white/75">
              Make the edit for
              <select
                value={effectiveAthlete ?? ""}
                onChange={(e) => setEditAthleteId(e.target.value)}
                className="mt-1 w-full rounded border border-white/30 bg-neutral-900 px-2 py-2 text-sm text-white"
              >
                {elig.qualifying.map((id) => (
                  <option key={id} value={id}>
                    {labelOf(id)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <fieldset className="grid grid-cols-2 gap-2 text-xs text-white/75">
            <legend className="col-span-2 mb-1 font-semibold text-white">Your free shirt</legend>
            <label>
              Size
              <select
                value={shirt.size}
                onChange={(e) => setShirt({ size: e.target.value as SizeId | "" })}
                className="mt-1 w-full rounded border border-white/30 bg-neutral-900 px-2 py-2 text-sm text-white"
              >
                <option value="">Choose…</option>
                {SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Color
              <select
                value={shirt.color}
                onChange={(e) => setShirt({ color: e.target.value as ColorId | "" })}
                className="mt-1 w-full rounded border border-white/30 bg-neutral-900 px-2 py-2 text-sm text-white"
              >
                <option value="">Choose…</option>
                {COLORS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2">
              Sleeve
              <select
                value={shirt.sleeve}
                onChange={(e) => setShirt({ sleeve: e.target.value as Sleeve })}
                className="mt-1 w-full rounded border border-white/30 bg-neutral-900 px-2 py-2 text-sm text-white"
              >
                <option value="left">Left sleeve (right-handed)</option>
                <option value="right">Right sleeve (left-handed)</option>
              </select>
            </label>
          </fieldset>
          <p className="text-xs text-white/60">
            You&apos;ll enter your name, email and shipping address on the secure Stripe checkout page. Shipping is free.
          </p>
          {!shirtReady && <p className="text-xs font-semibold text-amber-300">Choose your shirt size and color to check out.</p>}
          <button
            type="button"
            onClick={() => setEditAdded(false)}
            className="rounded border border-white/40 px-3 py-1 text-xs"
          >
            Remove the BRYT VISION EDIT
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="edit-add"
            disabled={!elig.unlocked}
            aria-disabled={!elig.unlocked}
            onClick={() => {
              setEditAthleteId(elig.qualifying[0] ?? null);
              setEditAdded(true);
            }}
            className={
              "rounded px-4 py-2 text-sm font-bold uppercase tracking-wider text-white transition-colors " +
              (elig.unlocked ? "bg-green-600 hover:bg-green-500" : "cursor-not-allowed bg-green-900/60 text-white/60")
            }
          >
            {elig.unlocked ? `Add ${formatCents(EDIT_PRICE_CENTS)} EDIT + free shirt` : "Locked"}
          </button>
          <p className="min-w-0 flex-1 text-xs text-white/80" data-testid="edit-help">
            {elig.unlocked
              ? "You qualify! Tap the green button to add it."
              : count === 0
                ? `Select ${EDIT_MIN_CLIPS} clips of the same athlete to unlock it. Clips can come from different games.`
                : bestCount === 0
                  ? `Your selected clips aren't assigned to an athlete profile yet, so they can't unlock it.`
                  : `${bestCount} of ${EDIT_MIN_CLIPS} clips of ${labelOf(elig.bestAthleteId)}. Select ${elig.needed} more clip${elig.needed === 1 ? "" : "s"} of the SAME athlete to unlock.`}
          </p>
        </div>
      )}

      {lostQualification && (
        <p className="mt-2 text-xs font-semibold text-amber-300" role="alert">
          The BRYT VISION EDIT was removed: {EDIT_MIN_CLIPS} clips of the same athlete are required.
        </p>
      )}
    </section>
  );

  return (
    <aside
      aria-label="Your purchase"
      className="sticky bottom-3 z-20 mt-8 max-h-[80vh] overflow-y-auto rounded-xl border-2 border-accent bg-white p-4 text-black shadow-lg"
    >
      {count === 0 ? (
        <>
          <p className="text-sm font-semibold text-accent">
            Select {BUNDLE_MIN_CLIPS} or more highlights and save! Get every clip for just{" "}
            {formatCents(BUNDLE_PRICE_CENTS)} each.
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Click &ldquo;Select&rdquo; on the clips you want, or use Buy on a single clip.
          </p>
        </>
      ) : (
        <>
          <p
            className={
              "text-sm font-semibold " + (price.bundleApplied ? "text-green-700" : "text-accent")
            }
          >
            {price.bundleApplied
              ? `Bundle price unlocked! Every clip is ${formatCents(BUNDLE_PRICE_CENTS)}.`
              : `Select ${BUNDLE_MIN_CLIPS} or more highlights and save! Get every clip for just ${formatCents(BUNDLE_PRICE_CENTS)} each.`}
            {!price.bundleApplied && (
              <span className="font-normal text-gray-600">
                {" "}
                Add {more} more clip{more === 1 ? "" : "s"} to unlock it.
              </span>
            )}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-600">Selected clips</dt>
            <dd className="text-right font-semibold" data-testid="cart-count">
              {price.count}
            </dd>
            <dt className="text-gray-600">Original price</dt>
            <dd className="text-right" data-testid="cart-original">
              {formatCents(price.originalCents)}
            </dd>
            <dt className="text-gray-600">Bundle discount</dt>
            <dd className="text-right text-green-700" data-testid="cart-discount">
              {price.savingsCents > 0 ? `−${formatCents(price.savingsCents)}` : formatCents(0)}
            </dd>
            <dt className="text-gray-600">Total savings</dt>
            <dd className="text-right text-green-700" data-testid="cart-savings">
              {formatCents(price.savingsCents)}
            </dd>
            {editActive && (
              <>
                <dt className="text-gray-600">BRYT VISION EDIT + free shirt</dt>
                <dd className="text-right" data-testid="cart-edit">
                  {formatCents(EDIT_PRICE_CENTS)}
                </dd>
              </>
            )}
            <dt className="border-t border-gray-200 pt-1 text-base font-bold">Final price</dt>
            <dd className="border-t border-gray-200 pt-1 text-right text-base font-bold" data-testid="cart-total">
              {formatCents(totals.totalCents)}
            </dd>
          </dl>
        </>
      )}

      {offer}

      {count > 0 && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={checkout}
            disabled={!canCheckout}
            className="flex-1 rounded bg-accent px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-50"
          >
            {loading
              ? "Redirecting to checkout…"
              : `Checkout · ${price.count} clip${price.count === 1 ? "" : "s"}${editActive ? " + EDIT" : ""} · ${formatCents(totals.totalCents)}`}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={loading}
            className="rounded border border-gray-300 px-3 py-3 text-sm"
          >
            Clear
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </aside>
  );
}
