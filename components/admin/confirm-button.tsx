"use client";

import { useActionState, useState } from "react";

import type { MutationResult } from "@/lib/admin/mutations";

type ConfirmAction = (formData: FormData) => Promise<MutationResult>;

/**
 * A destructive admin control: one click arms it and shows exactly what will
 * happen, a second click runs the server action. The result (or error) is
 * shown inline — no native `confirm()` dialog.
 */
export function ConfirmButton({
  action,
  fields,
  label,
  confirmPrompt,
  confirmLabel = "Yes, do it",
  tone = "danger",
}: {
  action: ConfirmAction;
  fields: Record<string, string>;
  label: string;
  confirmPrompt: string;
  confirmLabel?: string;
  tone?: "danger" | "normal";
}) {
  const [armed, setArmed] = useState(false);
  const [state, formAction, pending] = useActionState<
    MutationResult | null,
    FormData
  >(async (_prev, formData) => action(formData), null);

  if (state?.ok) {
    return <p className="text-xs text-green-700">{state.message}</p>;
  }

  const idleClass =
    tone === "danger"
      ? "rounded-full border border-red-300 px-3 py-1 text-sm text-red-700 transition-colors hover:bg-red-50"
      : "rounded-full border border-border px-3 py-1 text-sm transition-colors hover:border-accent";

  return (
    <form action={formAction} className="text-right">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {!armed ? (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className={idleClass}
        >
          {label}
        </button>
      ) : (
        <div className="space-y-1">
          <p className="ml-auto max-w-xs whitespace-pre-line text-xs text-muted">
            {confirmPrompt}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="rounded-full border border-border px-3 py-1 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-red-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      )}

      {state && !state.ok && (
        <p className="ml-auto mt-1 max-w-xs text-xs text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}
