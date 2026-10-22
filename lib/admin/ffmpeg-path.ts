import "server-only";

import { constants } from "node:fs";
import { access, chmod, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import installer from "@ffmpeg-installer/ffmpeg";

let cached: Promise<string> | null = null;

/**
 * Where the FFmpeg program is. `FFMPEG_PATH` overrides it (useful for testing against a system FFmpeg);
 * otherwise the program bundled with the @ffmpeg-installer/ffmpeg package is used.
 *
 * If that file is not marked executable (npm skips the package's own "make it executable" install step
 * when scripts are not approved, and some hosts drop file permissions when packaging), a copy is made in
 * the temporary folder and marked executable there. The packaged file itself is never changed.
 */
export function resolveFfmpegPath(): Promise<string> {
  cached ??= (async () => {
    const override = process.env.FFMPEG_PATH?.trim();
    if (override) return override;
    const packaged = installer.path;
    try {
      await access(packaged, constants.X_OK);
      return packaged;
    } catch {
      const copy = path.join(tmpdir(), "bryt-ffmpeg");
      await copyFile(packaged, copy);
      await chmod(copy, 0o755);
      return copy;
    }
  })().catch((error) => {
    cached = null;
    throw error;
  });
  return cached;
}
