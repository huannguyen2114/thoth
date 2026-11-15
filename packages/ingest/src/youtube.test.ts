import { readFileSync } from "node:fs";
import { join } from "node:path";
import { err, ingestFailure, ok } from "@thoth/core";
import { describe, expect, it } from "vitest";
import {
  type Cue,
  type CueFetcher,
  groupCues,
  normaliseLibraryCues,
  parseJson3,
  parseYoutube,
  youtubeVideoId,
} from "./youtube";
import { pickEnglishTrack } from "./youtube-sources";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, "__fixtures__", name), "utf8"));

describe("youtubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?list=x&v=dQw4w9WgXcQ&t=42", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("reads %s", (url, id) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  it.each([
    "https://www.youtube.com/channel/UC123",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "not a url",
  ])("rejects %s", (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });
});

const cue = (startSec: number, durSec: number, text: string): Cue => ({ startSec, durSec, text });

describe("groupCues", () => {
  it("groups unpunctuated auto-captions into ~60 s segments with time locators", () => {
    const cues = Array.from({ length: 50 }, (_, i) => cue(i * 4, 4, `words ${i}`));
    const segs = groupCues(cues);
    expect(segs.length).toBe(3);
    expect(segs[0]?.locator).toEqual({ type: "time", startSec: 0, endSec: 60 });
    expect(segs[1]?.locator).toEqual({ type: "time", startSec: 60, endSec: 120 });
    // The 20 s tail (180-200) joins the previous group.
    expect(segs.at(-1)?.locator).toEqual({ type: "time", startSec: 120, endSec: 200 });
    expect(segs.map((s) => s.idx)).toEqual([0, 1, 2]);
    expect(segs[0]?.text.startsWith("words 0 words 1")).toBe(true);
  });

  it("closes a group at a sentence end once it is at least 30 s long", () => {
    const segs = groupCues([
      cue(0, 10, "First part"),
      cue(10, 10, "is here."),
      cue(20, 15, "This ends the thought."),
      cue(35, 32, "Next topic starts"),
    ]);
    expect(segs.map((s) => s.locator)).toEqual([
      { type: "time", startSec: 0, endSec: 35 },
      { type: "time", startSec: 35, endSec: 67 },
    ]);
  });

  it("merges a short closing tail into the previous segment", () => {
    const segs = groupCues([cue(0, 40, "Main point."), cue(40, 2, "Thanks.")]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      text: "Main point. Thanks.",
      locator: { type: "time", startSec: 0, endSec: 42 },
    });
  });

  it("keeps a short tail separate when merging would pass 90 s", () => {
    const segs = groupCues([cue(0, 80, "Long part"), cue(80, 15, "short end")]);
    expect(segs.map((s) => s.locator)).toEqual([
      { type: "time", startSec: 0, endSec: 80 },
      { type: "time", startSec: 80, endSec: 95 },
    ]);
  });

  it("never lets a group pass 90 s", () => {
    const segs = groupCues([cue(0, 50, "a"), cue(50, 50, "b"), cue(100, 5, "c")], {
      targetSec: 1000,
    });
    for (const s of segs) {
      if (s.locator.type === "time")
        expect(s.locator.endSec - s.locator.startSec).toBeLessThanOrEqual(90);
    }
  });

  it("drops empty cues, collapses whitespace and sorts by time", () => {
    const segs = groupCues([cue(5, 2, " b \n c "), cue(0, 2, "a"), cue(3, 1, "  ")]);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.text).toBe("a b c");
  });
});

describe("normaliseLibraryCues", () => {
  it("converts srv3 milliseconds to seconds", () => {
    const cues = normaliseLibraryCues(fixture("youtube-library-srv3.json"));
    expect(cues[0]).toEqual({ startSec: 0.32, durSec: 3.2, text: "welcome to the course" });
    expect(cues.at(-1)?.startSec).toBeCloseTo(9.1);
  });

  it("keeps classic-format seconds", () => {
    const cues = normaliseLibraryCues([
      { text: "a", offset: 1.5, duration: 2.5 },
      { text: "b", offset: 4, duration: 3 },
    ]);
    expect(cues.map((c) => c.startSec)).toEqual([1.5, 4]);
  });
});

describe("parseJson3", () => {
  it("reads yt-dlp json3 events and skips line-break-only events", () => {
    const cues = parseJson3(fixture("yt-dlp.en.json3"));
    expect(cues).toEqual([
      { startSec: 0, durSec: 4.2, text: "Today we look at memory." },
      { startSec: 4.2, durSec: 5, text: "Memory has three stages." },
    ]);
  });

  it("returns [] for unexpected shapes", () => {
    expect(parseJson3(null)).toEqual([]);
    expect(parseJson3({ events: "x" })).toEqual([]);
  });
});

describe("parseYoutube", () => {
  const cues = [cue(0, 20, "Hello and welcome."), cue(20, 20, "Today is about cells.")];
  const ok_: CueFetcher = async () => ok(cues);
  const none: CueFetcher = async () => ok([]);
  const noCaptions: CueFetcher = async () =>
    err(ingestFailure("This video has no captions.", false));

  it("returns the oEmbed title and grouped segments", async () => {
    const r = await parseYoutube("https://youtu.be/dQw4w9WgXcQ", {
      cueFetchers: [ok_],
      fetchTitle: async () => "Cell biology 101",
    });
    expect(r.ok && r.value.title).toBe("Cell biology 101");
    expect(r.ok && r.value.segments[0]?.locator).toEqual({ type: "time", startSec: 0, endSec: 40 });
  });

  it("falls back to the next fetcher when the first fails", async () => {
    const r = await parseYoutube("https://youtu.be/dQw4w9WgXcQ", {
      cueFetchers: [noCaptions, ok_],
      fetchTitle: async () => null,
    });
    expect(r.ok && r.value.title).toBe("YouTube video dQw4w9WgXcQ");
  });

  it("keeps the first real failure when the fallback has nothing", async () => {
    const r = await parseYoutube("https://youtu.be/dQw4w9WgXcQ", {
      cueFetchers: [noCaptions, none],
      fetchTitle: async () => null,
    });
    expect(!r.ok && r.error.message).toBe("This video has no captions.");
  });

  it("explains when no fetcher finds captions", async () => {
    const r = await parseYoutube("https://youtu.be/dQw4w9WgXcQ", {
      cueFetchers: [none],
      fetchTitle: async () => null,
    });
    expect(!r.ok && r.error.message).toMatch(/could not find captions/);
  });

  it("rejects a non-video link without calling any fetcher", async () => {
    let called = false;
    const r = await parseYoutube("https://www.youtube.com/@channel", {
      cueFetchers: [
        async () => {
          called = true;
          return ok(cues);
        },
      ],
      fetchTitle: async () => null,
    });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
});

describe("pickEnglishTrack", () => {
  it("finds an English variant in the library's error message", () => {
    expect(
      pickEnglishTrack(
        "[YoutubeTranscript] No transcripts are available in en this video (x). Available languages: ar, en-US, fr",
      ),
    ).toBe("en-US");
  });
  it("returns null when there is no English track", () => {
    expect(pickEnglishTrack("Available languages: ar, fr")).toBeNull();
    expect(pickEnglishTrack("something else")).toBeNull();
  });
});
