import { describe, expect, it } from "vitest";
import { hitRects, mergeLines, thinPoints, toPageRects } from "./geometry";
import { linkQuote, locatorIn, marksIn, pieces } from "./text-ranges";

const page = { left: 100, top: 50, width: 400, height: 800 };

describe("page geometry", () => {
  it("turns screen rects into 0..1 page rects, one per line, dropping the full-page box", () => {
    const rects = toPageRects(
      [
        { left: 140, top: 130, width: 80, height: 16 },
        { left: 220, top: 131, width: 60, height: 15 },
        { left: 140, top: 150, width: 100, height: 16 },
        { left: 100, top: 50, width: 400, height: 800 },
        { left: 0, top: 0, width: 0, height: 10 },
      ],
      page,
      3,
    );
    expect(rects).toEqual([
      { page: 3, x: 0.1, y: 0.1, w: 0.35, h: 0.02 },
      { page: 3, x: 0.1, y: 0.125, w: 0.25, h: 0.02 },
    ]);
  });

  it("merges only touching boxes on the same line", () => {
    const a = { page: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.02 };
    expect(mergeLines([a, { ...a, x: 0.5 }])).toHaveLength(2);
    expect(mergeLines([a, { ...a, x: 0.205 }])).toHaveLength(1);
  });

  it("hit tests with slack and thins ink points", () => {
    expect(hitRects([{ page: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.1 }], 0.202, 0.15)).toBe(true);
    expect(hitRects([{ page: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.1 }], 0.3, 0.15)).toBe(false);
    const thin = thinPoints([
      [0.1, 0.1, 0.5],
      [0.1001, 0.1, 0.5],
      [0.2, 0.2, 0.7],
    ]);
    expect(thin).toEqual([
      [0.1, 0.1, 0.5],
      [0.2, 0.2, 0.7],
    ]);
  });
});

describe("text highlights", () => {
  const ann = (id: string, exact: string, prefix = "") => ({
    id,
    color: "yellow" as const,
    comment: null,
    payload: null,
    anchor: {
      kind: "content" as const,
      contentId: "c" as never,
      locator: null,
      quote: { exact, prefix, suffix: "" },
    },
  });

  it("finds quotes again, picking the occurrence with the matching prefix", () => {
    const text = "heat flows. Later, heat flows again.";
    const marks = marksIn(text, [ann("a", "heat flows", "Later, ")]);
    expect(marks).toEqual([{ start: 19, end: 29, id: "a", color: "yellow", comment: false }]);
    expect(pieces(text, marks).map((p) => p.text)).toEqual([
      "heat flows. Later, ",
      "heat flows",
      " again.",
    ]);
  });

  it("drops a highlight whose passage is gone, and clips overlaps", () => {
    const text = "abcdefghij";
    expect(marksIn(text, [ann("x", "zzz")])).toEqual([]);
    const m = marksIn(text, [ann("a", "bcde"), ann("b", "defg")]);
    expect(m.map((x) => [x.start, x.end])).toEqual([
      [1, 5],
      [5, 7],
    ]);
  });

  it("matches locators to segments and shortens link quotes at a word", () => {
    expect(
      locatorIn(
        { type: "time", startSec: 50, endSec: 50 },
        { type: "time", startSec: 42, endSec: 106 },
        1,
      ),
    ).toBe(true);
    expect(locatorIn({ type: "page", page: 2 }, { type: "page", page: 3 }, 2)).toBe(false);
    expect(
      locatorIn(
        { type: "offset", start: 0, end: 0, paragraph: 2 },
        { type: "offset", start: 0, end: 9 },
        1,
      ),
    ).toBe(true);
    expect(linkQuote("one two three four", 9)).toBe("one two");
  });
});
