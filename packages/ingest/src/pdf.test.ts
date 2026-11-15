import { describe, expect, it } from "vitest";
import { makePdf } from "./__fixtures__/make-pdf";
import { parsePdf } from "./pdf";

describe("parsePdf", () => {
  it("returns one segment per page with page locators", async () => {
    const r = await parsePdf(
      makePdf([["Cells are the unit of life.", "They divide."], ["Mitochondria make ATP."]]),
      "biology.pdf",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).toBe("biology");
    expect(r.value.segments).toHaveLength(2);
    expect(r.value.segments[0]).toMatchObject({ idx: 0, locator: { type: "page", page: 1 } });
    expect(r.value.segments[0]?.text).toContain("Cells are the unit of life.");
    expect(r.value.segments[1]).toMatchObject({
      idx: 1,
      text: "Mitochondria make ATP.",
      locator: { type: "page", page: 2 },
    });
  });

  it("accepts a Node Buffer, as fs.readFile returns", async () => {
    const r = await parsePdf(Buffer.from(makePdf([["From disk"]])), "disk.pdf");
    expect(r.ok && r.value.segments[0]?.text).toBe("From disk");
  });

  it("skips empty pages but keeps real page numbers", async () => {
    const r = await parsePdf(makePdf([["Intro"], [], ["Page three text"]]));
    expect(r.ok && r.value.segments.map((s) => s.locator)).toEqual([
      { type: "page", page: 1 },
      { type: "page", page: 3 },
    ]);
    expect(r.ok && r.value.segments.map((s) => s.idx)).toEqual([0, 1]);
  });

  it("prefers the title from PDF metadata", async () => {
    const r = await parsePdf(makePdf([["Body"]], { title: "Lecture 4: Memory" }), "x.pdf");
    expect(r.ok && r.value.title).toBe("Lecture 4: Memory");
  });

  it("falls back to the first line when there is no metadata or file name", async () => {
    const r = await parsePdf(makePdf([["Chapter one", "More text"]]));
    expect(r.ok && r.value.title).toBe("Chapter one");
  });

  it("fails with a fix-it message when no page has text", async () => {
    const r = await parsePdf(makePdf([[], []]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatchObject({ code: "ingest_failed", retryable: false });
      expect(r.error.message).toMatch(/OCR/);
    }
  });

  it("fails on bytes that are not a PDF", async () => {
    const r = await parsePdf(new TextEncoder().encode("not a pdf at all"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/could not read this PDF/);
  });
});
