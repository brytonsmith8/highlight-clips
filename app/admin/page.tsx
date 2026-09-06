import Link from "next/link";
import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/admin/auth";
import { logout } from "@/app/admin/login/actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminDashboard() {
  await requireAdminOrRedirect();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-accent hover:underline"
          >
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/games"
          className="rounded-lg border border-border p-4 transition-colors hover:border-accent"
        >
          <p className="font-semibold">Games</p>
          <p className="text-sm text-muted">Add, view, and delete games</p>
        </Link>
        <Link
          href="/admin/athletes"
          className="rounded-lg border border-border p-4 transition-colors hover:border-accent"
        >
          <p className="font-semibold">Athletes</p>
          <p className="text-sm text-muted">Add, view, and delete athletes</p>
        </Link>
        <Link
          href="/admin/clips"
          className="rounded-lg border border-border p-4 transition-colors hover:border-accent"
        >
          <p className="font-semibold">Clips</p>
          <p className="text-sm text-muted">Add, publish/unpublish, delete</p>
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-lg border border-border p-4 transition-colors hover:border-accent"
        >
          <p className="font-semibold">Orders</p>
          <p className="text-sm text-muted">
            Resend link, extend window, delete
          </p>
        </Link>
      </div>
    </div>
  );
}
