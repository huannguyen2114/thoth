import {
  err,
  type IngestFailure,
  ingestFailure,
  type NewSegment,
  ok,
  type ParsedSource,
  type Result,
  youtubeVideoId,
} from "@thoth/core";

/** One caption line, in seconds. */
export interface Cue {
  startSec: number;
  durSec: number;
  text: string;
}

/** Fetches the caption cues of a video. Each source (library, yt-dlp) implements this. */
export type CueFetcher = (
  videoId: string,
  signal?: AbortSignal,
) => Promise<Result<Cue[], IngestFailure>>;

export interface YoutubeDeps {
  /** Tried in order; the first success wins. */
  cueFetchers: CueFetcher[];
  fetchTitle: (videoId: string, signal?: AbortSignal) => Promise<string | null>;
}

export { youtubeVideoId };

export interface GroupOptions {
  minSec?: number;
  targetSec?: number;
  maxSec?: number;
}

/**
 * Groups caption cues into segments of about 30–90 seconds with `{ type: "time" }` locators.
 * A group closes at a sentence end once it is `minSec` long, at `targetSec` regardless, and
 * never grows past `maxSec`. Auto-captions have no punctuation, so they close at `targetSec`.
 */
export function groupCues(cues: Cue[], options: GroupOptions = {}): NewSegment[] {
  const { minSec = 30, targetSec = 60, maxSec = 90 } = options;
  const clean = cues
    .map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() }))
    .filter((c) => c.text.length > 0)
    .sort((a, b) => a.startSec - b.startSec);

  const segments: NewSegment[] = [];
  let group: Cue[] = [];
  const flush = () => {
    const first = group[0];
    const last = group.at(-1);
    if (!first || !last) return;
    segments.push({
      idx: segments.length,
      text: group.map((c) => c.text).join(" "),
      locator: {
        type: "time",
        startSec: round(first.startSec),
        endSec: round(Math.max(last.startSec + last.durSec, first.startSec)),
      },
    });
    group = [];
  };

  for (const cue of clean) {
    const start = group[0]?.startSec;
    if (start !== undefined && cue.startSec + cue.durSec - start > maxSec) flush();
    group.push(cue);
    const first = group[0] as Cue;
    const length = cue.startSec + cue.durSec - first.startSec;
    if (length >= targetSec || (length >= minSec && /[.!?]["')\]]?$/.test(cue.text))) flush();
  }
  flush();
  return segments;
}

const round = (n: number) => Math.round(n * 10) / 10;

export async function parseYoutube(
  url: string,
  deps: YoutubeDeps,
  signal?: AbortSignal,
): Promise<Result<ParsedSource, IngestFailure>> {
  const videoId = youtubeVideoId(url);
  if (!videoId) {
    return err(
      ingestFailure(
        "This does not look like a YouTube video link. Copy the address from the video page and try again.",
        false,
      ),
    );
  }

  let lastFailure: IngestFailure | null = null;
  let cues: Cue[] | null = null;
  for (const fetchCues of deps.cueFetchers) {
    const r = await fetchCues(videoId, signal);
    if (r.ok && r.value.length > 0) {
      cues = r.value;
      break;
    }
    if (!r.ok) lastFailure = r.error;
  }
  if (!cues) {
    return err(
      lastFailure ??
        ingestFailure(
          "We could not find captions for this video. Pick a video with captions, or install yt-dlp and try again.",
          false,
        ),
    );
  }

  const segments = groupCues(cues);
  if (segments.length === 0) {
    return err(ingestFailure("This video's captions are empty. Try a different video.", false));
  }
  const title = (await deps.fetchTitle(videoId, signal)) ?? `YouTube video ${videoId}`;
  return ok({ title, segments });
}

/**
 * Normalises cues from the `youtube-transcript` library to seconds.
 * The library returns milliseconds for the srv3 caption format and seconds for the classic
 * one, without saying which. Caption cues last a few seconds, so a median duration above 50
 * can only be milliseconds.
 */
export function normaliseLibraryCues(
  raw: { text: string; offset: number; duration: number }[],
): Cue[] {
  const durations = raw.map((r) => r.duration).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)] ?? 0;
  const scale = median > 50 ? 1000 : 1;
  return raw.map((r) => ({ startSec: r.offset / scale, durSec: r.duration / scale, text: r.text }));
}

/** Parses yt-dlp's `json3` subtitle format. */
export function parseJson3(json: unknown): Cue[] {
  const events = (json as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  const cues: Cue[] = [];
  for (const e of events as {
    tStartMs?: number;
    dDurationMs?: number;
    segs?: { utf8?: string }[];
  }[]) {
    if (typeof e.tStartMs !== "number" || !Array.isArray(e.segs)) continue;
    const text = e.segs.map((s) => s.utf8 ?? "").join("");
    if (!text.trim()) continue;
    cues.push({ startSec: e.tStartMs / 1000, durSec: (e.dDurationMs ?? 0) / 1000, text });
  }
  return cues;
}
