import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ingestFailure, ok } from "@thoth/core";
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { type CueFetcher, normaliseLibraryCues, parseJson3 } from "./youtube";

/**
 * Network-facing YouTube sources. Unit tests replace these with fixtures; see youtube.test.ts.
 */

/** Captions through the `youtube-transcript` library (InnerTube, then page scraping). */
export const libraryCueFetcher: CueFetcher = async (videoId, signal) => {
  try {
    const fetchWithSignal: typeof fetch = (input, init) =>
      fetch(input, { ...init, signal: signal ?? null });
    const raw = await YoutubeTranscript.fetchTranscript(videoId, { fetch: fetchWithSignal });
    return ok(normaliseLibraryCues(raw));
  } catch (e) {
    if (e instanceof YoutubeTranscriptTooManyRequestError) {
      return err(
        ingestFailure(
          "YouTube is limiting requests from this network. Wait a few minutes, then try again.",
          true,
          e,
        ),
      );
    }
    if (e instanceof YoutubeTranscriptVideoUnavailableError) {
      return err(
        ingestFailure(
          "This video is private, removed or region-locked. Try a video you can play.",
          false,
          e,
        ),
      );
    }
    if (
      e instanceof YoutubeTranscriptDisabledError ||
      e instanceof YoutubeTranscriptNotAvailableError
    ) {
      return err(
        ingestFailure(
          "This video has no captions. Pick a video with captions, or install yt-dlp and try again.",
          false,
          e,
        ),
      );
    }
    return err(
      ingestFailure("We could not reach YouTube. Check your connection, then try again.", true, e),
    );
  }
};

/**
 * Fallback: subtitles (manual first, then automatic) through the `yt-dlp` CLI, if installed.
 * A missing binary is not an error worth reporting on its own, so it returns an empty list
 * and the caller keeps the library's failure message.
 */
export const ytDlpCueFetcher: CueFetcher = async (videoId, signal) => {
  const dir = await mkdtemp(join(tmpdir(), "thoth-ytdlp-"));
  try {
    const run = await execFileResult(
      "yt-dlp",
      [
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        "en.*,en",
        "--sub-format",
        "json3",
        "--no-playlist",
        "--quiet",
        "-o",
        join(dir, "%(id)s.%(ext)s"),
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      signal,
    );
    if (run === "missing") return ok([]);
    if (run !== "ok") {
      return err(
        ingestFailure(
          "yt-dlp could not download captions for this video. Update yt-dlp, then try again.",
          true,
          run,
        ),
      );
    }
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json3")).sort(preferManual);
    const file = files[0];
    if (!file) return ok([]);
    return ok(parseJson3(JSON.parse(await readFile(join(dir, file), "utf8"))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** `id.en.json3` (manual) sorts before `id.en-orig.json3` / auto variants. */
const preferManual = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

function execFileResult(
  cmd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<"ok" | "missing" | Error> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 120_000, signal }, (error) => {
      if (!error) resolve("ok");
      else if ((error as NodeJS.ErrnoException).code === "ENOENT") resolve("missing");
      else resolve(error);
    });
  });
}

/** Title via YouTube oEmbed. Returns null on any failure, so ingestion can still finish. */
export async function oembedTitle(videoId: string, signal?: AbortSignal): Promise<string | null> {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`,
      signal ? { signal } : {},
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { title?: unknown };
    return typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  } catch {
    return null;
  }
}
