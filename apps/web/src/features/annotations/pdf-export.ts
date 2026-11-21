import type { Annotation, AnnotationColor, NormRect } from "@thoth/core";
import {
  PDFArray,
  type PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  type PDFPage,
  PDFString,
} from "pdf-lib";
import tokens from "../../../../../design/hearth/tokens.json";
import { COLORS } from "./colors";

/**
 * Writes Thoth annotations into a copy of a PDF as standard PDF annotations (doc 21,
 * ADR-0038), so any reader shows them: Highlight (QuadPoints), Ink, Square, Circle, Line with an
 * arrow head, and Text (a comment pin). The original bytes are not changed.
 *
 * Colours are the Hearth tokens (ADR-0009), read from `tokens.json`: strokes use the light
 * theme value; highlights use the brighter dark theme value, which reads well over black text.
 */

type Rgb = [number, number, number];

function tokenRgb(name: string, theme: "light" | "dark"): Rgb {
  const t = (tokens.color.tokens as { name: string; value: Record<string, string> }[]).find(
    (x) => x.name === name,
  );
  const hex = t?.value[theme] ?? "";
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.5, 0.5, 0.5];
  return [1, 2, 3].map((i) => Number.parseInt(m[i] ?? "80", 16) / 255) as Rgb;
}

const colorOf = (c: AnnotationColor, use: "fill" | "stroke") =>
  tokenRgb(COLORS[c].token, use === "fill" ? "dark" : "light");

/** Maps 0..1 page space to PDF user space (origin bottom left) on the page's crop box. */
function mapper(page: PDFPage) {
  const box = page.getCropBox();
  return {
    x: (nx: number) => box.x + nx * box.width,
    y: (ny: number) => box.y + box.height - ny * box.height,
    w: box.width,
    h: box.height,
  };
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function addAnnot(doc: PDFDocument, page: PDFPage, dict: Record<string, unknown>) {
  const ref = doc.context.register(doc.context.obj(dict as never));
  const existing = page.node.lookup(PDFName.of("Annots"));
  if (existing instanceof PDFArray) existing.push(ref);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
}

const text = (s: string) => PDFHexString.fromText(s);

/** Which pages an annotation is drawn on, with its geometry there. */
function pagesOf(a: Annotation): number[] {
  if (a.payload) return [a.payload.page];
  return [...new Set((a.anchor.rects ?? []).map((r) => r.page))];
}

export async function writeAnnotatedPdf(
  original: Uint8Array,
  annotations: Annotation[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  for (const a of annotations) {
    for (const pageNo of pagesOf(a)) {
      const page = pages[pageNo - 1];
      if (!page) continue;
      const m = mapper(page);
      const base: Record<string, unknown> = {
        Type: "Annot",
        F: 4, // Print
        T: text("Thoth"),
        M: PDFString.of(pdfDate(a.updatedAt)),
        NM: text(a.id),
        ...(a.comment ? { Contents: text(a.comment) } : {}),
      };
      const stroke = colorOf(a.color, "stroke");
      const p = a.payload;

      if (p?.type === "ink") {
        const width = Math.max(0.5, p.width * m.w);
        const pts = p.strokes.flat();
        const xs = pts.map((q) => m.x(q[0]));
        const ys = pts.map((q) => m.y(q[1]));
        addAnnot(doc, page, {
          ...base,
          Subtype: "Ink",
          Rect: [
            Math.min(...xs) - width,
            Math.min(...ys) - width,
            Math.max(...xs) + width,
            Math.max(...ys) + width,
          ],
          InkList: p.strokes.map((s) => s.flatMap((q) => [m.x(q[0]), m.y(q[1])])),
          BS: { W: width },
          C: stroke,
        });
        continue;
      }
      if (p?.type === "shape") {
        const x1 = m.x(p.x1);
        const y1 = m.y(p.y1);
        const x2 = m.x(p.x2);
        const y2 = m.y(p.y2);
        const [lx, ly, hx, hy] = [
          Math.min(x1, x2),
          Math.min(y1, y2),
          Math.max(x1, x2),
          Math.max(y1, y2),
        ];
        const rect = [lx, ly, hx, hy];
        if (p.shape === "arrow") {
          addAnnot(doc, page, {
            ...base,
            Subtype: "Line",
            Rect: [lx - 8, ly - 8, hx + 8, hy + 8],
            L: [x1, y1, x2, y2],
            LE: ["None", "OpenArrow"],
            BS: { W: 1.5 },
            C: stroke,
          });
        } else {
          addAnnot(doc, page, {
            ...base,
            Subtype: p.shape === "ellipse" ? "Circle" : "Square",
            Rect: rect,
            BS: { W: 1.5 },
            C: stroke,
          });
        }
        continue;
      }

      const rects = (a.anchor.rects ?? []).filter((r) => r.page === pageNo);
      if (a.kind === "comment" && !a.anchor.quote) {
        const r = rects[0];
        if (!r) continue;
        const x = m.x(r.x);
        const y = m.y(r.y);
        addAnnot(doc, page, {
          ...base,
          Subtype: "Text",
          Name: "Comment",
          Rect: [x, y - 20, x + 20, y],
          C: stroke,
        });
        continue;
      }
      if (rects.length === 0) continue;
      addAnnot(doc, page, {
        ...base,
        Subtype: "Highlight",
        Rect: boundsOf(rects, m),
        QuadPoints: rects.flatMap((r) => {
          const left = m.x(r.x);
          const right = m.x(r.x + r.w);
          const top = m.y(r.y);
          const bottom = m.y(r.y + r.h);
          return [left, top, right, top, left, bottom, right, bottom];
        }),
        C: colorOf(a.color, "fill"),
        CA: 0.5,
      });
    }
  }
  return doc.save();
}

function boundsOf(rects: NormRect[], m: ReturnType<typeof mapper>): number[] {
  const xs = rects.flatMap((r) => [m.x(r.x), m.x(r.x + r.w)]);
  const ys = rects.flatMap((r) => [m.y(r.y), m.y(r.y + r.h)]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** For tests: the subtypes of every annotation on each page of a saved PDF. */
export async function readAnnotationSubtypes(bytes: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const annots = page.node.lookup(PDFName.of("Annots"));
    if (!(annots instanceof PDFArray)) return [];
    return annots.asArray().map((ref) => {
      const d = doc.context.lookup(ref) as PDFDict;
      return String(d.get(PDFName.of("Subtype"))).replace(/^\//, "");
    });
  });
}
