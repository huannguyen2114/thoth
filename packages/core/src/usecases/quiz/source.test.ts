import { describe, expect, it } from "vitest";
import type { Chapter, Segment } from "../../domain/content";
import { pageChapters, pageSegments } from "./fakes";
import { renderSourceText, resolveCitation, segmentsForChapter } from "./source";

describe("segmentsForChapter (pages)", () => {
  it("runs from a chapter's page to the next chapter's page", () => {
    expect(
      segmentsForChapter(pageChapters[0] as Chapter, pageChapters, pageSegments).map(
        (s) => s.locator,
      ),
    ).toEqual([
      { type: "page", page: 1 },
      { type: "page", page: 2 },
    ]);
  });
  it("lets the last chapter run to the end", () => {
    expect(segmentsForChapter(pageChapters[1] as Chapter, pageChapters, pageSegments)).toHaveLength(
      2,
    );
  });
});

describe("segmentsForChapter (time)", () => {
  const seg = (idx: number, s: number): Segment => ({
    id: `${idx}` as Segment["id"],
    contentId: "c" as Segment["contentId"],
    idx,
    text: `t${idx}`,
    locator: { type: "time", startSec: s, endSec: s + 10 },
  });
  const chapter = (idx: number, s: number): Chapter => ({
    ...(pageChapters[0] as Chapter),
    idx,
    locator: { type: "time", startSec: s, endSec: s + 100 },
  });
  it("assigns each cue to the chapter containing its start", () => {
    const segs = [seg(0, 0), seg(1, 50), seg(2, 100), seg(3, 150)];
    const chapters = [chapter(0, 0), chapter(1, 100)];
    expect(segmentsForChapter(chapters[0] as Chapter, chapters, segs).map((s) => s.idx)).toEqual([
      0, 1,
    ]);
    expect(segmentsForChapter(chapters[1] as Chapter, chapters, segs).map((s) => s.idx)).toEqual([
      2, 3,
    ]);
  });
  it("renders time tokens and resolves a cited second to its cue", () => {
    const segs = [seg(0, 0), seg(1, 201)];
    expect(renderSourceText(segs)).toBe("[00:00] t0\n[03:21] t1");
    expect(resolveCitation("[03:25]", segs)).toEqual({ type: "time", startSec: 201, endSec: 211 });
  });
});

describe("resolveCitation", () => {
  it("maps page tokens to a real page and ignores unknown or missing ones", () => {
    expect(resolveCitation("[p.2]", pageSegments)).toEqual({ type: "page", page: 2 });
    expect(resolveCitation("[p.99]", pageSegments)).toBeNull();
    expect(resolveCitation("see page two", pageSegments)).toBeNull();
    expect(resolveCitation(null, pageSegments)).toBeNull();
  });
  it("truncates the rendered text at the character budget", () => {
    expect(renderSourceText(pageSegments, 30).split("\n")).toHaveLength(1);
  });
});
