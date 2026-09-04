import { getExpiryInfo } from "@/lib/format";

/** Small pill showing how long a game stays publicly available. */
export function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const info = getExpiryInfo(expiresAt);
  if (info.expired) return null;

  return (
    <span
      className={
        "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium " +
        (info.urgent
          ? "bg-red-100 text-red-700"
          : "bg-zinc-100 text-zinc-600")
      }
    >
      {info.label}
    </span>
  );
}
