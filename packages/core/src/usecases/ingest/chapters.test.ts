import { describe, expect, it } from "vitest";
import type { Locator, Segment } from "../../domain/content";
import { type ContentId, newId, type SegmentId } from "../../shared/id";
import { generateChapters, spanLocator, splitIntoWindows, toChapters } from "./chapters";
import { FakeLlm } from "./fakes.test-support";
import { chaptersOutputSchema, formatTime, renderSegments } from "./prompts";

const seg = (idx: number, locator: Locator, text = `Segment ${idx} text.`): Segment => ({
  id: newId<SegmentId>(),
  contentId: "c" as ContentId,
  idx,
  text,
  locator,
});
const timeSegs = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    seg(i, { type: "time", startSec: i * 60, endSec: i * 60 + 60 }),
  );

describe("chaptersOutputSchema", () => {
  it("accepts a good reply", () => {
    const good = {
      chapters: [{ startSegment: 0, title: "Intro", summary: "What the course is." }],
    };
    expect(chaptersOutputSchema.safeParse(good).success).toBe(true);
  });

  it.each([
    ["no chapters", { chapters: [] }],
    ["missing title", { chapters: [{ startSegment: 0, summary: "x" }] }],
    ["negative start", { chapters: [{ startSegment: -1, title: "a", summary: "b" }] }],
    ["fractional start", { chapters: [{ startSegment: 1.5, title: "a", summary: "b" }] }],
    ["wrong shape", ["Intro", "Body"]],
  ])("rejects a bad reply: %s", (_, bad) => {
    expect(chaptersOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("toChapters", () => {
  const window = timeSegs(6);

  it("computes time ranges from segment starts", () => {
    const chapters = toChapters(
      {
        chapters: [
          { startSegment: 3, title: "Second.", summary: "B" },
          { startSegment: 0, title: "First", summary: "A" },
        ],
      },
      window,
    );
    expect(chapters.map((c) => [c.title, c.locator])).toEqual([
      ["First", { type: "time", startSec: 0, endSec: 180 }],
      ["Second", { type: "time", startSec: 180, endSec: 360 }],
    ]);
  });

  it("moves the first chapter to the window start and drops invalid or duplicate starts", () => {
    const chapters = toChapters(
      {
        chapters: [
          { startSegment: 2, title: "A", summary: "a" },
          { startSegment: 2, title: "Dup", summary: "d" },
          { startSegment: 99, title: "Out of range", summary: "x" },
          { startSegment: 4, title: "B", summary: "b" },
        ],
      },
      window,
    );
    expect(chapters.map((c) => c.title)).toEqual(["A", "B"]);
    expect(chapters[0]?.locator).toEqual({ type: "time", startSec: 0, endSec: 240 });
  });

  it("covers the whole window when no start is valid", () => {
    const chapters = toChapters(
      { chapters: [{ startSegment: 50, title: "Only", summary: "s" }] },
      window,
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.locator).toEqual({ type: "time", startSec: 0, endSec: 360 });
  });

  it("clips very long titles and summaries", () => {
    const [c] = toChapters(
      { chapters: [{ startSegment: 0, title: "t".repeat(300), summary: "s".repeat(2000) }] },
      window,
    );
    expect(c?.title.length).toBeLessThanOrEqual(120);
    expect(c?.summary.length).toBeLessThanOrEqual(600);
  });
});

describe("spanLocator", () => {
  it("uses the first page for PDFs and a char range for text", () => {
    expect(
      spanLocator([seg(0, { type: "page", page: 3 }), seg(1, { type: "page", page: 4 })]),
    ).toEqual({ type: "page", page: 3 });
    expect(
      spanLocator([
        seg(0, { type: "offset", start: 0, end: 10 }),
        seg(1, { type: "offset", start: 12, end: 40 }),
      ]),
    ).toEqual({ type: "offset", start: 0, end: 40 });
  });
});

describe("splitIntoWindows", () => {
  it("keeps whole segments and respects the size budget", () => {
    const segs = Array.from({ length: 10 }, (_, i) =>
      seg(i, { type: "page", page: i + 1 }, "x".repeat(400)),
    );
    const windows = splitIntoWindows(segs, 1000);
    expect(windows.map((w) => w.length)).toEqual([2, 2, 2, 2, 2]);
  });
});

describe("generateChapters", () => {
  it("sends numbered segments as context and the chapters task", async () => {
    const llm = new FakeLlm(() => ({
      chapters: [{ startSegment: 0, title: "Intro", summary: "Basics." }],
    }));
    const r = await generateChapters(llm, "Brain lecture", timeSegs(3));
    expect(r.ok && r.value).toEqual([
      {
        idx: 0,
        title: "Intro",
        summary: "Basics.",
        locator: { type: "time", startSec: 0, endSec: 180 },
      },
    ]);
    const req = llm.requests[0];
    expect(req?.task).toBe("chapters");
    expect(req?.context).toContain("[0] (00:00) Segment 0 text.");
    expect(req?.context).toContain("[2] (02:00)");
    expect(req?.messages[0]?.content).toContain("Brain lecture");
  });

  it("makes one call per window and numbers chapters across windows", async () => {
    const segs = Array.from({ length: 4 }, (_, i) =>
      seg(i, { type: "page", page: i + 1 }, "y".repeat(60_000)),
    );
    const llm = new FakeLlm((req) => {
      const first = Number(/starts at \[(\d+)\]/.exec(req.messages[0]?.content ?? "")?.[1]);
      return { chapters: [{ startSegment: first, title: `From ${first}`, summary: "s" }] };
    });
    const r = await generateChapters(llm, "Book", segs);
    expect(llm.requests).toHaveLength(4);
    expect(llm.requests[1]?.messages[0]?.content).toContain("part 2 of 4");
    expect(r.ok && r.value.map((c) => [c.idx, c.title])).toEqual([
      [0, "From 0"],
      [1, "From 1"],
      [2, "From 2"],
      [3, "From 3"],
    ]);
  });

  it("returns llm_bad_output for a reply that breaks the schema", async () => {
    const llm = new FakeLlm(() => ({ chapters: "Intro, Body" }));
    const r = await generateChapters(llm, "x", timeSegs(2));
    expect(!r.ok && r.error.code).toBe("llm_bad_output");
  });
});

describe("prompt helpers", () => {
  it("formats times like citations", () => {
    expect(formatTime(201)).toBe("03:21");
    expect(formatTime(3725)).toBe("1:02:05");
  });
  it("labels pages and paragraphs", () => {
    expect(renderSegments([seg(4, { type: "page", page: 12 }, "Hi")])).toBe("[4] (p.12) Hi");
    expect(renderSegments([seg(0, { type: "offset", start: 0, end: 2 }, "Hi")])).toBe("[0] (§) Hi");
  });
});
