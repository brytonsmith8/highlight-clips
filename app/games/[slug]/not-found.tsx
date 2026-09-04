import Link from "next/link";

export default function GameNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Game not available</h1>
      <p className="mt-2 text-muted">
        This game may have expired, or the link may be incorrect.
      </p>
      <Link
        href="/games"
        className="mt-4 inline-block text-accent hover:underline"
      >
        See available games
      </Link>
    </div>
  );
}
