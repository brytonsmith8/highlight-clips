"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

/** Live countdown to a fixed timestamp, updated every 30s. */
export function Countdown({ expiresAt }: { expiresAt: string }) {
  const target = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const interval = setInterval(() => setRemaining(target - Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [target]);

  return <p className="mt-1 font-medium">{formatRemaining(remaining)}</p>;
}
