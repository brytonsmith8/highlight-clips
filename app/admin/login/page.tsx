import type { Metadata } from "next";

import { login } from "./actions";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

interface AdminLoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold">Admin sign in</h1>
      {error && (
        <p className="mt-2 text-sm text-red-600">Incorrect password.</p>
      )}
      <form action={login} className="mt-6 space-y-4">
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Password"
          className="w-full rounded border border-border px-3 py-2"
        />
        <button
          type="submit"
          className="w-full rounded bg-accent px-3 py-2 font-medium text-white"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
