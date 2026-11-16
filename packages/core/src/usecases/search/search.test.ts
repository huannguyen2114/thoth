import { describe, expect, it } from "vitest";
import type { Content, Segment } from "../../domain/content";
import type {
  ContentRepository,
  NoteRepository,
  SegmentRepository,
} from "../../ports/repositories";
import type { ContentId, SegmentId } from "../../shared/id";
import {
  locatorToken,
  mergeHits,
  queryTerms,
  type SearchHit,
  searchEverything,
  snippetAround,
  titleScore,
} from "./search";

const content = (id: string, title: string): Content =>
  ({ id: id as ContentId, title, sourceUrl: null }) as Content;

function deps(opts: {
  contents: Content[];
  notes?: { contentId: string; markdown: string }[];
  segs?: { segment: Segment; rank: number }[];
}) {
  return {
    contents: { listRecent: async () => opts.contents } as unknown as ContentRepository,
    notes: {
      list: async () => (opts.notes ?? []).map((n) => ({ ...n, updatedAt: new Date() })),
    } as unknown as NoteRepository,
    segments: { search: async () => opts.segs ?? [] } as unknown as SegmentRepository,
  };
}

const seg = (
  id: string,
  contentId: string,
  text: string,
  locator: Segment["locator"],
): Segment => ({
  id: id as SegmentId,
  contentId: contentId as ContentId,
  idx: 0,
  text,
  locator,
});

describe("helpers", () => {
  it("queryTerms keeps words of 2+ chars", () => {
    expect(queryTerms("  Mito-chondria, a 3D! ")).toEqual(["mito", "chondria", "3d"]);
  });
  it("locatorToken matches the citation tokens", () => {
    expect(locatorToken({ type: "page", page: 3 })).toBe("[p.3]");
    expect(locatorToken({ type: "time", startSec: 3723, endSec: 3730 })).toBe("[1:02:03]");
    expect(locatorToken({ type: "time", startSec: 201, endSec: 210 })).toBe("[03:21]");
    expect(locatorToken({ type: "offset", start: 0, end: 5, paragraph: 4 })).toBe("[§4]");
    expect(locatorToken({ type: "offset", start: 0, end: 5 })).toBe("");
  });
  it("snippetAround centres on the first match with ellipses", () => {
    const text = `${"lorem ".repeat(30)}needle ${"ipsum ".repeat(30)}`;
    const s = snippetAround(text, ["needle"]);
    expect(s).toContain("needle");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThan(100);
  });
  it("titleScore needs every term; prefix and whole words rank higher", () => {
    expect(titleScore("Cell biology", ["cell", "chem"])).toBe(0);
    expect(titleScore("Cell biology", ["cell"])).toBeGreaterThan(
      titleScore("Excellent cells", ["cell"]),
    );
  });
});

describe("mergeHits", () => {
  const h = (id: string, kind: SearchHit["kind"], score: number): SearchHit => ({
    id,
    kind,
    contentId: "c",
    title: "t",
    snippet: null,
    at: null,
    href: "/",
    score,
  });
  it("orders titles, then notes, then source, by score within a kind", () => {
    const out = mergeHits(
      [
        h("s1", "source", 9),
        h("n1", "note", 1),
        h("t1", "title", 1),
        h("t2", "title", 5),
        h("n2", "note", 3),
      ],
      10,
    );
    expect(out.map((x) => x.id)).toEqual(["t2", "t1", "n2", "n1", "s1"]);
  });
  it("drops duplicate ids and applies the limit", () => {
    const out = mergeHits([h("a", "title", 1), h("a", "title", 2), h("b", "title", 0)], 1);
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("searchEverything", () => {
  it("returns nothing for an empty query", async () => {
    expect(await searchEverything(deps({ contents: [] }), { query: " ! " })).toEqual([]);
  });
  it("finds a word only inside a PDF page and links to that page", async () => {
    const d = deps({
      contents: [content("c1", "Lecture 1")],
      segs: [
        {
          segment: seg("s1", "c1", "The mitochondria is the powerhouse", { type: "page", page: 3 }),
          rank: -4,
        },
      ],
    });
    const [hit] = await searchEverything(d, { query: "mitochondria" });
    expect(hit).toMatchObject({ kind: "source", title: "Lecture 1" });
    expect(decodeURIComponent(hit?.href ?? "")).toBe("/content/c1?at=[p.3]");
  });
  it("finds titles and notes, titles first", async () => {
    const d = deps({
      contents: [content("c1", "Photosynthesis"), content("c2", "Other")],
      notes: [{ contentId: "c2", markdown: "Remember photosynthesis steps" }],
    });
    const hits = await searchEverything(d, { query: "photosynthesis" });
    expect(hits.map((x) => [x.kind, x.contentId])).toEqual([
      ["title", "c1"],
      ["note", "c2"],
    ]);
    expect(hits[1]?.href).toBe("/content/c2");
  });
  it("ignores notes and segments of contents that no longer exist", async () => {
    const d = deps({
      contents: [],
      notes: [{ contentId: "gone", markdown: "word" }],
      segs: [{ segment: seg("s", "gone", "word", { type: "page", page: 1 }), rank: -1 }],
    });
    expect(await searchEverything(d, { query: "word" })).toEqual([]);
  });
});
