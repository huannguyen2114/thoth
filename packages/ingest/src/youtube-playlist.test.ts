import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parsePlaylistData,
  parseYtDlpPlaylist,
  readInitialData,
  YoutubePlaylistLister,
  type YtDlpRunner,
} from "./youtube-playlist";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");
const page =
  (html: string, status = 200) =>
  async () =>
    new Response(html, { status });
const noYtDlp: YtDlpRunner = async () => "missing";

describe("ytInitialData", () => {
  it("reads the playlist videos in order, without duplicates or bad ids", () => {
    const data = readInitialData(fixture("youtube-playlist.html"));
    const { listing, more } = parsePlaylistData(data);
    expect(listing.title).toBe("Intro to Biology");
    expect(listing.videos).toEqual([
      { id: "aaaaaaaaaa1", title: 'Lecture 1: Cells {and} "membranes"' },
      { id: "bbbbbbbbbb2", title: "Lecture 2: DNA" },
    ]);
    expect(more).toBe(false);
  });

  it("reads the newer lockup shape and notices a continuation", () => {
    const { listing, more } = parsePlaylistData(
      readInitialData(fixture("youtube-playlist-lockup.html")),
    );
    expect(listing.videos).toEqual([{ id: "ccccccccc_3", title: "Week 3" }]);
    expect(more).toBe(true);
  });

  it("returns null when the page has no data", () => {
    expect(readInitialData("<html>consent page</html>")).toBeNull();
  });
});

describe("YoutubePlaylistLister", () => {
  it("uses the page when it holds the whole playlist", async () => {
    let asked = false;
    const lister = new YoutubePlaylistLister({
      fetch: page(fixture("youtube-playlist.html")),
      ytDlp: async () => {
        asked = true;
        return "missing";
      },
    });
    const r = await lister.list("PLbio0000000");
    expect(r.ok && r.value.videos.map((v) => v.id)).toEqual(["aaaaaaaaaa1", "bbbbbbbbbb2"]);
    expect(asked).toBe(false);
  });

  it("asks yt-dlp for the rest of a long playlist", async () => {
    const calls: string[][] = [];
    const lister = new YoutubePlaylistLister({
      fetch: page(fixture("youtube-playlist-lockup.html")),
      ytDlp: async (args) => {
        calls.push(args);
        return fixture("yt-dlp-playlist.json");
      },
    });
    const r = await lister.list("PLlong000000");
    expect(r.ok && r.value.videos.map((v) => v.id)).toEqual(["ccccccccc_3", "ddddddddd-4"]);
    expect(calls[0]).toEqual(expect.arrayContaining(["--flat-playlist", "-J"]));
  });

  it("keeps the first page when yt-dlp is not installed", async () => {
    const lister = new YoutubePlaylistLister({
      fetch: page(fixture("youtube-playlist-lockup.html")),
      ytDlp: noYtDlp,
    });
    const r = await lister.list("PLlong000000");
    expect(r.ok && r.value.videos).toHaveLength(1);
  });

  it("falls back to yt-dlp when the page fails, and explains when both fail", async () => {
    const viaCli = new YoutubePlaylistLister({
      fetch: page("<html>consent</html>"),
      ytDlp: async () => fixture("yt-dlp-playlist.json"),
    });
    expect((await viaCli.list("PLlong000000")).ok).toBe(true);

    const missing = new YoutubePlaylistLister({ fetch: page("", 404), ytDlp: noYtDlp });
    const r = await missing.list("PLgone000000");
    expect(!r.ok && r.error.message).toMatch(/does not exist/);

    const offline = new YoutubePlaylistLister({
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      ytDlp: noYtDlp,
    });
    const o = await offline.list("PLx000000000");
    expect(!o.ok && o.error.retryable).toBe(true);
  });

  it("reads yt-dlp output defensively", () => {
    expect(parseYtDlpPlaylist({ title: 3, entries: "no" })).toEqual({ title: null, videos: [] });
  });
});
