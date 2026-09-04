"use client";

import { useState } from "react";

import { getPreviewUrl } from "@/app/games/actions";

type State = "idle" | "loading" | "ready" | "error";

/**
 * Low-quality preview player. On click it asks the server for a short-lived
 * signed URL and plays it inline. The high-quality original is never exposed
 * here. Falls back to a clear message if no preview is available.
 */
export function PreviewPlayer({ clipId }: { clipId: string }) {
  const [state, setState] = useState<State>("idle");
  const [url, setUrl] = useState<string | null>(null);

  async function loadPreview() {
    setState("loading");
    const result = await getPreviewUrl(clipId);
    if ("url" in result) {
      setUrl(result.url);
      setState("ready");
    } else {
      setState("error");
    }
  }

  if (state === "ready" && url) {
    return (
      <video
        src={url}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded bg-black"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={loadPreview}
      disabled={state === "loading"}
      className="flex aspect-video w-full items-center justify-center rounded border border-border bg-zinc-50 text-sm font-medium text-muted transition-colors hover:border-accent disabled:opacity-60"
    >
      {state === "loading"
        ? "Loading preview…"
        : state === "error"
          ? "Preview unavailable"
          : "► Play preview"}
    </button>
  );
}
