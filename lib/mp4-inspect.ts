/**
 * Reads facts from an MP4's own boxes. Pure functions (no DOM, no server APIs),
 * shared by the browser preview generator and the server-side upload checks.
 * It reports what the file CLAIMS; it does not decode any pixels or sound.
 * Works on a truncated buffer too (for example the first 256 KB of a file):
 * anything beyond the buffer is simply not seen and reported as unknown (null).
 */

const u32 = (b: Uint8Array, o: number) =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const i32 = (b: Uint8Array, o: number) =>
  (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "moof", "traf", "edts", "mvex"]);

function walkBoxes(
  b: Uint8Array,
  start: number,
  end: number,
  visit: (type: string, payload: number, boxEnd: number) => void,
): void {
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o);
    const type = fourcc(b, o + 4);
    let header = 8;
    if (size === 1) {
      size = u32(b, o + 8) * 4294967296 + u32(b, o + 12);
      header = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < header || o + size > end) break;
    visit(type, o + header, o + size);
    if (CONTAINERS.has(type)) walkBoxes(b, o + header, o + size, visit);
    o += size;
  }
}

interface TrackInfo {
  id: number;
  handler: string;
  timescale: number;
  firstStart: number | null;
  hasEmptyEdit: boolean;
}

function readTracks(bytes: Uint8Array): { tracks: TrackInfo[]; heights: number[] } {
  const tracks: Record<number, TrackInfo> = {};
  const heights: number[] = [];
  let current: TrackInfo | null = null;
  let currentFragmentTrack: TrackInfo | null = null;
  walkBoxes(bytes, 0, bytes.length, (type, p, end) => {
    const version = bytes[p];
    if (type === "trak") {
      current = null;
    } else if (type === "tkhd") {
      const id = u32(bytes, p + (version ? 20 : 12));
      current = tracks[id] ??= {
        id,
        handler: "?",
        timescale: 1,
        firstStart: null,
        hasEmptyEdit: false,
      };
      const widthAt = p + (version ? 88 : 76);
      if (widthAt + 8 <= bytes.length) heights.push(u32(bytes, widthAt + 4) / 65536);
    } else if (type === "mdhd" && current) {
      current.timescale = u32(bytes, p + (version ? 20 : 12)) || 1;
    } else if (type === "hdlr" && current) {
      current.handler = fourcc(bytes, p + 8);
    } else if (type === "elst" && current) {
      const count = u32(bytes, p + 4);
      let q = p + 8;
      for (let k = 0; k < count && k < 4 && q + 12 <= end; k++) {
        // media_time of -1 marks an empty edit (a gap before the first sample)
        if (version === 1 ? i32(bytes, q + 8) === -1 && i32(bytes, q + 12) === -1 : i32(bytes, q + 4) === -1) {
          current.hasEmptyEdit = true;
        }
        q += version === 1 ? 20 : 12;
      }
    } else if (type === "tfhd") {
      currentFragmentTrack = tracks[u32(bytes, p + 4)] ?? null;
    } else if (type === "tfdt" && currentFragmentTrack) {
      const base = version ? u32(bytes, p + 4) * 4294967296 + u32(bytes, p + 8) : u32(bytes, p + 4);
      if (currentFragmentTrack.firstStart === null) {
        currentFragmentTrack.firstStart = base / currentFragmentTrack.timescale;
      }
    }
  });
  return { tracks: Object.values(tracks), heights };
}

/** Sample-entry boxes (avc1, mp4a, ...) sit inside stsd, which the walker does not descend into. */
function readSampleEntries(bytes: Uint8Array): Map<number, Set<string>> {
  const found = new Map<number, Set<string>>();
  let trackId = 0;
  walkBoxes(bytes, 0, bytes.length, (type, p, end) => {
    if (type === "tkhd") trackId = u32(bytes, p + (bytes[p] ? 20 : 12));
    if (type === "stsd") {
      // full box header (4) + entry count (4), then the first entry: size(4) + type(4)
      const entry = fourcc(bytes, p + 12);
      if (end >= p + 16) {
        const set = found.get(trackId) ?? new Set<string>();
        set.add(entry);
        found.set(trackId, set);
      }
    }
  });
  return found;
}

export interface Mp4Facts {
  isMp4: boolean;
  brand: string | null;
  hasH264: boolean;
  hasAac: boolean;
  height: number | null;
  videoStart: number | null;
  audioStart: number | null;
  hasEmptyEdit: boolean;
}

/** Facts read from the file's own boxes (what the file claims; pixels are checked separately). */
export function inspectMp4(buffer: ArrayBuffer): Mp4Facts {
  const bytes = new Uint8Array(buffer);
  const brand = bytes.length >= 12 && fourcc(bytes, 4) === "ftyp" ? fourcc(bytes, 8) : null;
  const facts: Mp4Facts = {
    isMp4: brand !== null && brand !== "qt  ",
    brand,
    hasH264: false,
    hasAac: false,
    height: null,
    videoStart: null,
    audioStart: null,
    hasEmptyEdit: false,
  };
  if (!facts.isMp4) return facts;
  const { tracks, heights } = readTracks(bytes);
  const entries = readSampleEntries(bytes);
  for (const track of tracks) {
    const kinds = entries.get(track.id) ?? new Set<string>();
    if (track.handler === "vide") {
      facts.hasH264 ||= kinds.has("avc1") || kinds.has("avc3");
      facts.videoStart = track.firstStart;
    } else if (track.handler === "soun") {
      facts.hasAac ||= kinds.has("mp4a");
      facts.audioStart = track.firstStart;
    }
    facts.hasEmptyEdit ||= track.hasEmptyEdit;
  }
  if (heights.length) facts.height = Math.max(...heights);
  return facts;
}

