import type { Annotation, AnnotationId, ContentId } from "@thoth/core";
import { type PDFArray, type PDFDict, PDFDocument, PDFName, type PDFNumber } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { readAnnotationSubtypes, writeAnnotatedPdf } from "./pdf-export";

const C = "c1" as ContentId;
const at = new Date(2026, 10, 21);
const ann = (id: string, over: Partial<Annotation>): Annotation => ({
  id: id as AnnotationId,
  contentId: C,
  kind: "highlight",
  anchor: { kind: "content", contentId: C, locator: { type: "page", page: 1 } },
  color: "yellow",
  comment: null,
  payload: null,
  createdAt: at,
  updatedAt: at,
  ...over,
});

async function twoPages() {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  doc.addPage([600, 800]);
  return doc.save();
}

describe("annotated PDF export", () => {
  it("writes every kind as a standard PDF annotation and leaves the original alone", async () => {
    const original = await twoPages();
    const copy = original.slice();
    const out = await writeAnnotatedPdf(original, [
      ann("h", {
        anchor: {
          kind: "content",
          contentId: C,
          locator: { type: "page", page: 1 },
          quote: { exact: "Entropy", prefix: "", suffix: "" },
          rects: [{ page: 1, x: 0.1, y: 0.1, w: 0.5, h: 0.05 }],
        },
        comment: "Key idea",
      }),
      ann("i", {
        kind: "ink",
        payload: {
          type: "ink",
          page: 2,
          width: 0.004,
          strokes: [
            [
              [0.1, 0.1, 0.5],
              [0.3, 0.4, 0.5],
            ],
          ],
        },
      }),
      ann("r", {
        kind: "shape",
        payload: { type: "shape", page: 2, shape: "rect", x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.3 },
      }),
      ann("e", {
        kind: "shape",
        payload: { type: "shape", page: 2, shape: "ellipse", x1: 0.5, y1: 0.5, x2: 0.7, y2: 0.6 },
      }),
      ann("a", {
        kind: "shape",
        payload: { type: "shape", page: 2, shape: "arrow", x1: 0.2, y1: 0.8, x2: 0.6, y2: 0.7 },
      }),
      ann("t", {
        kind: "comment",
        comment: "Check this",
        anchor: {
          kind: "content",
          contentId: C,
          locator: { type: "page", page: 1 },
          rects: [{ page: 1, x: 0.8, y: 0.5, w: 0.02, h: 0.02 }],
        },
      }),
    ]);
    expect(original).toEqual(copy);
    expect(await readAnnotationSubtypes(out)).toEqual([
      ["Highlight", "Text"],
      ["Ink", "Square", "Circle", "Line"],
    ]);
    // The highlight's quad sits at the top of page 1 in PDF space (y grows upward).
    const doc = await PDFDocument.load(out);
    const annots = doc.getPages()[0]?.node.lookup(PDFName.of("Annots")) as PDFArray;
    const h = doc.context.lookup(annots.get(0)) as PDFDict;
    const quad = (h.get(PDFName.of("QuadPoints")) as PDFArray)
      .asArray()
      .map((n) => (n as PDFNumber).asNumber());
    expect(quad.map((n) => Math.round(n))).toEqual([60, 720, 360, 720, 60, 680, 360, 680]);
    expect(h.get(PDFName.of("Contents"))?.toString()).toContain("FEFF");
  });

  it("skips marks on pages the file does not have", async () => {
    const out = await writeAnnotatedPdf(await twoPages(), [
      ann("x", {
        kind: "ink",
        payload: { type: "ink", page: 9, width: 0.004, strokes: [[[0.1, 0.1, 0.5]]] },
      }),
    ]);
    expect(await readAnnotationSubtypes(out)).toEqual([[], []]);
  });
});
