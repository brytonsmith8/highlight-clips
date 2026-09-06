import Link from "next/link";

export default function OrderNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Order not found</h1>
      <p className="mt-2 text-muted">
        This link may be incorrect, or the purchase couldn&apos;t be located. If
        you just completed payment, wait a few seconds and refresh this page.
      </p>
      <Link href="/games" className="mt-4 inline-block text-accent hover:underline">
        See available games
      </Link>
    </div>
  );
}
