import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { adminListAthletes } from "@/lib/admin/queries";
import { createAthlete } from "./actions";

export const metadata: Metadata = {
  title: "Admin · Athletes",
  robots: { index: false, follow: false },
};

export default async function AdminAthletesPage() {
  await requireAdminOrRedirect();
  const athletes = await adminListAthletes();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Athletes</h1>

      <form
        action={createAthlete}
        className="mt-6 space-y-3 rounded-lg border border-border p-4"
      >
        <h2 className="font-semibold">New athlete</h2>
        <input
          name="name"
          placeholder="Name"
          required
          className="w-full rounded border border-border px-3 py-2"
        />
        <input
          name="jersey_number"
          placeholder="Jersey number (optional)"
          className="w-full rounded border border-border px-3 py-2"
        />
        <button
          type="submit"
          className="rounded bg-accent px-3 py-2 font-medium text-white"
        >
          Create athlete
        </button>
      </form>

      <div className="mt-6 space-y-2">
        {athletes.length === 0 && (
          <p className="text-muted">No athletes yet.</p>
        )}
        {athletes.map((athlete) => (
          <div
            key={athlete.id}
            className="rounded-lg border border-border p-3"
          >
            <p className="font-medium">
              {athlete.name}
              {athlete.jersey_number ? ` #${athlete.jersey_number}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
