"use client";

import { useState } from "react";

import { NewClipForm, type ClipFormAthlete, type ClipFormGame } from "@/components/admin/new-clip-form";
import { NewGameForm } from "@/components/admin/new-game-form";

/**
 * The dashboard's upload workspace: pick (or add) the game, then upload one or many videos. Adding a game here
 * selects it automatically for the upload form below it, so nothing needs a separate page.
 */
export function UploadWorkspace({
  games,
  athletes,
  jerseyOptions,
  schools,
  sports,
  tablesReady,
}: {
  games: ClipFormGame[];
  athletes: ClipFormAthlete[];
  jerseyOptions: Record<string, string[]>;
  schools: string[];
  sports: string[];
  tablesReady: boolean;
}) {
  const [showNewGame, setShowNewGame] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | undefined>(undefined);

  return (
    <section aria-label="Highlight upload workspace">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">Upload highlights</h2>
        <button
          type="button"
          onClick={() => setShowNewGame((v) => !v)}
          aria-expanded={showNewGame}
          className="rounded-full border border-border px-3 py-1 text-sm font-medium hover:border-accent"
        >
          {showNewGame ? "Close new game" : "+ New game"}
        </button>
      </div>

      {showNewGame && (
        <NewGameForm
          schools={schools}
          sports={sports}
          tablesReady={tablesReady}
          onCreated={(id) => {
            setSelectedGameId(id);
            setShowNewGame(false);
          }}
        />
      )}

      <NewClipForm
        games={games}
        athletes={athletes}
        jerseyOptions={jerseyOptions}
        selectedGameId={selectedGameId}
      />
    </section>
  );
}
