import { execFile } from "node:child_process";
import {
  err,
  type IngestFailure,
  ingestFailure,
  ok,
  type PlaylistLister,
  type PlaylistListing,
  type PlaylistVideo,
  type Result,
} from "@thoth/core";
import type { FetchLike } from "./webpage";

/**
 * Lists the videos of a YouTube playlist (Phase 10 bulk add, doc 22). Never downloads media:
 *
 * 1. Fetch the playlist page and read `ytInitialData`, the JSON the page boots from. It holds
 *    the first 100 or so videos.
 * 2. When that fails, or the page says there are more (a continuation), ask
 *    `yt-dlp --flat-playlist -J` if it is installed, which pages through the whole list.
 */
export type YtDlpRunner = (
  args: string[],
  signal?: AbortSignal,
) => Promise<string | "missing" | Error>;

export interface PlaylistListerDeps {
  fetch?: FetchLike;
  ytDlp?: YtDlpRunner;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_PAGE_BYTES = 8 * 1024 * 1024;

export class YoutubePlaylistLister implements PlaylistLister {
  private readonly fetchImpl: FetchLike;
  private readonly ytDlp: YtDlpRunner;

  constructor(deps: PlaylistListerDeps = {}) {
    this.fetchImpl = deps.fetch ?? fetch;
    this.ytDlp = deps.ytDlp ?? runYtDlp;
  }

  async list(
    playlistId: string,
    signal?: AbortSignal,
  ): Promise<Result<PlaylistListing, IngestFailure>> {
    const page = await this.fromPage(playlistId, signal);
    if (page.ok && !page.value.more) return ok(page.value.listing);

    const cli = await this.fromYtDlp(playlistId, signal);
    if (cli.ok && cli.value) return ok(cli.value);
    if (page.ok) return ok(page.value.listing);
    return err(page.error);
  }

  private async fromPage(
    playlistId: string,
    signal?: AbortSignal,
  ): Promise<Result<{ listing: PlaylistListing; more: boolean }, IngestFailure>> {
    const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
    let html: string;
    try {
      const res = await this.fetchImpl(url, {
        headers: { "Accept-Language": "en", "User-Agent": "Mozilla/5.0 Thoth" },
        ...(signal ? { signal } : {}),
      });
      if (res.status === 404) {
        return err(ingestFailure("This playlist does not exist. Check the link.", false));
      }
      if (!res.ok) {
        return err(ingestFailure(`YouTube answered ${res.status}. Try again in a minute.`, true));
      }
      html = (await res.text()).slice(0, MAX_PAGE_BYTES);
    } catch (e) {
      return err(
        ingestFailure(
          "We could not reach YouTube. Check your connection, then try again.",
          true,
          e,
        ),
      );
    }
    const data = readInitialData(html);
    if (!data) {
      return err(ingestFailure("YouTube did not send the playlist. Try again later.", true));
    }
    const parsed = parsePlaylistData(data);
    if (parsed.listing.videos.length === 0) {
      return err(
        ingestFailure(
          "This playlist is empty, private or unavailable. Try a public playlist.",
          false,
        ),
      );
    }
    return ok(parsed);
  }

  private async fromYtDlp(
    playlistId: string,
    signal?: AbortSignal,
  ): Promise<Result<PlaylistListing | null, IngestFailure>> {
    const run = await this.ytDlp(
      ["--flat-playlist", "-J", "--quiet", `https://www.youtube.com/playlist?list=${playlistId}`],
      signal,
    );
    if (run === "missing") return ok(null);
    if (run instanceof Error) {
      return err(ingestFailure("yt-dlp could not list this playlist.", true, run));
    }
    try {
      const listing = parseYtDlpPlaylist(JSON.parse(run));
      return ok(listing.videos.length ? listing : null);
    } catch (e) {
      return err(ingestFailure("yt-dlp sent a playlist we could not read.", true, e));
    }
  }
}

/** The `ytInitialData` object embedded in a YouTube page, or null. */
export function readInitialData(html: string): unknown {
  const marker = /(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*/.exec(html);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  const json = balancedObject(html, start);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** The `{...}` starting at `start`, honouring strings and escapes. */
function balancedObject(text: string, start: number): string | null {
  if (text[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

const textOf = (v: unknown): string | null => {
  if (!isObj(v)) return typeof v === "string" ? v : null;
  if (typeof v.simpleText === "string") return v.simpleText;
  if (typeof v.content === "string") return v.content;
  if (Array.isArray(v.runs)) {
    return v.runs.map((r) => (isObj(r) && typeof r.text === "string" ? r.text : "")).join("");
  }
  return null;
};

/**
 * Videos (in order) and the playlist title from `ytInitialData`. Reads both the classic
 * `playlistVideoRenderer` and the newer `lockupViewModel` shapes, so a YouTube redesign of one
 * does not empty the list. `more` is true when the page has a continuation (over ~100 videos).
 */
export function parsePlaylistData(data: unknown): { listing: PlaylistListing; more: boolean } {
  const videos: PlaylistVideo[] = [];
  const seen = new Set<string>();
  let more = false;
  let title = null as string | null;

  const add = (id: unknown, t: string | null) => {
    if (typeof id !== "string" || !VIDEO_ID.test(id) || seen.has(id)) return;
    seen.add(id);
    videos.push({ id, title: t?.trim() || null });
  };

  const walk = (node: unknown, depth: number) => {
    if (depth > 60) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    if (!isObj(node)) return;
    const pvr = node.playlistVideoRenderer;
    if (isObj(pvr)) add(pvr.videoId, textOf(pvr.title));
    const lockup = node.lockupViewModel;
    if (
      isObj(lockup) &&
      (lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" || !lockup.contentType)
    ) {
      const meta = isObj(lockup.metadata) ? lockup.metadata.lockupMetadataViewModel : null;
      add(lockup.contentId, isObj(meta) ? textOf(meta.title) : null);
    }
    if (isObj(node.continuationItemRenderer)) more = true;
    const pmr = node.playlistMetadataRenderer;
    if (!title && isObj(pmr) && typeof pmr.title === "string") title = pmr.title;
    const phr = node.playlistHeaderRenderer;
    if (!title && isObj(phr)) title = textOf(phr.title);
    for (const v of Object.values(node)) if (typeof v === "object") walk(v, depth + 1);
  };
  walk(data, 0);
  return { listing: { title: title?.trim() || null, videos }, more };
}

/** `yt-dlp --flat-playlist -J` output: `{ title, entries: [{ id, title }] }`. */
export function parseYtDlpPlaylist(data: unknown): PlaylistListing {
  const obj = isObj(data) ? data : {};
  const entries = Array.isArray(obj.entries) ? obj.entries : [];
  const seen = new Set<string>();
  const videos: PlaylistVideo[] = [];
  for (const e of entries) {
    if (!isObj(e) || typeof e.id !== "string" || !VIDEO_ID.test(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    videos.push({ id: e.id, title: typeof e.title === "string" ? e.title : null });
  }
  return { title: typeof obj.title === "string" ? obj.title : null, videos };
}

/** Runs yt-dlp and returns its stdout, "missing" when it is not installed, or the error. */
export const runYtDlp: YtDlpRunner = (args, signal) =>
  new Promise((resolve) => {
    execFile(
      "yt-dlp",
      args,
      { timeout: 120_000, maxBuffer: 32 * 1024 * 1024, ...(signal ? { signal } : {}) },
      (error, stdout) => {
        if (!error) resolve(String(stdout));
        else if ((error as NodeJS.ErrnoException).code === "ENOENT") resolve("missing");
        else resolve(error);
      },
    );
  });
