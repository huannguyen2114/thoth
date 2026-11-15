import { describe, expect, it } from "vitest";
import { normalizeWhitespace, paragraphSegments, titleFromText } from "./text";

const para = (n: number, word = "word") => Array.from({ length: n }, () => word).join(" ");

describe("paragraphSegments", () => {
  it("splits on blank lines with offsets into the original text", () => {
    const text = `  ${para(50, "alpha")}.\n\n\n${para(50, "beta")}.\n  \n${para(50, "gamma")}.  `;
    const segs = paragraphSegments(text);
    expect(segs).toHaveLength(3);
    for (const s of segs) {
      expect(s.locator.type).toBe("offset");
      if (s.locator.type === "offset") {
        expect(text.slice(s.locator.start, s.locator.end)).toBe(s.text);
      }
    }
    expect(segs.map((s) => s.idx)).toEqual([0, 1, 2]);
    expect(segs[1]?.text.startsWith("beta")).toBe(true);
  });

  it("merges short paragraphs such as headings into the next one", () => {
    const text = `Heading\n\n${para(60)}.\n\nAnother heading\n\n${para(60)}.`;
    const segs = paragraphSegments(text);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.text.startsWith("Heading\n\nword")).toBe(true);
    expect(segs[1]?.text.startsWith("Another heading")).toBe(true);
  });

  it("joins a short tail to the segment before it", () => {
    const segs = paragraphSegments(`${para(60)}.\n\nThe end.`);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.text.endsWith("The end.")).toBe(true);
  });

  it("splits a very long paragraph at sentence ends", () => {
    const sentence = `${para(15)}. `;
    const text = sentence.repeat(60).trim();
    const segs = paragraphSegments(text, { maxChars: 500 });
    expect(segs.length).toBeGreaterThan(5);
    for (const s of segs) {
      expect(s.text.length).toBeLessThanOrEqual(500);
      expect(s.text.endsWith(".")).toBe(true);
      if (s.locator.type === "offset")
        expect(text.slice(s.locator.start, s.locator.end)).toBe(s.text);
    }
  });

  it("falls back to single line breaks when there are no blank lines", () => {
    const text = Array.from({ length: 10 }, () => `${para(40)}.`).join("\n");
    expect(paragraphSegments(text, { maxChars: 500 }).length).toBeGreaterThan(1);
  });

  it("splits CRLF text the way browsers submit a textarea", () => {
    const text = `Title\r\n\r\n${para(50, "alpha")}.\r\n\r\n${para(50, "beta")}.`;
    const segs = paragraphSegments(text);
    expect(segs).toHaveLength(2);
    expect(segs[1]?.text.startsWith("beta")).toBe(true);
    for (const s of segs) {
      if (s.locator.type === "offset")
        expect(text.slice(s.locator.start, s.locator.end)).toBe(s.text);
    }
  });

  it("returns nothing for blank text", () => {
    expect(paragraphSegments("  \n\n \t ")).toEqual([]);
  });
});

describe("normalizeWhitespace", () => {
  it("collapses spaces, trims lines and keeps paragraph breaks", () => {
    expect(normalizeWhitespace("a  \t b \r\n\r\n\r\n\n  c d ")).toBe("a b\n\nc d");
  });
});

describe("titleFromText", () => {
  it("uses the first line", () => {
    expect(titleFromText("\n  Photosynthesis basics \nmore")).toBe("Photosynthesis basics");
  });
  it("cuts long lines at a word boundary", () => {
    const t = titleFromText(para(40, "longword"), 30);
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(31);
  });
});
