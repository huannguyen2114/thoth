import type { AnnotationPayload, NormRect } from "@thoth/core";
import { getStroke } from "perfect-freehand";

/**
 * Page-space geometry for PDF annotations (ADR-0038): x and y run 0..1 across the page's width
 * and height, so marks survive zoom, resizing and export. Pure functions, unit tested.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Screen rects (from a text selection) to page-space rects, one per line. */
export function toPageRects(rects: Box[], page: Box, pageNo: number): NormRect[] {
  const out: NormRect[] = [];
  for (const r of rects) {
    if (r.width < 1 || r.height < 1) continue;
    // pdf.js adds a full-page box at the end of a selection; it is not text.
    if (r.width > page.width * 0.98 && r.height > page.height * 0.5) continue;
    const x = clamp01((r.left - page.left) / page.width);
    const y = clamp01((r.top - page.top) / page.height);
    const x2 = clamp01((r.left + r.width - page.left) / page.width);
    const y2 = clamp01((r.top + r.height - page.top) / page.height);
    if (x2 <= x || y2 <= y) continue;
    out.push({ page: pageNo, x, y, w: x2 - x, h: y2 - y });
  }
  return mergeLines(out).map((r) => ({
    ...r,
    x: round(r.x),
    y: round(r.y),
    w: round(r.w),
    h: round(r.h),
  }));
}

/** Joins boxes on the same line that touch or overlap, so a line is one box. */
export function mergeLines(rects: NormRect[]): NormRect[] {
  const sorted = [...rects].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const out: NormRect[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && last.page === r.page && sameLine(last, r) && r.x <= last.x + last.w + 0.01) {
      const x = Math.min(last.x, r.x);
      const y = Math.min(last.y, r.y);
      const x2 = Math.max(last.x + last.w, r.x + r.w);
      const y2 = Math.max(last.y + last.h, r.y + r.h);
      out[out.length - 1] = { page: r.page, x, y, w: x2 - x, h: y2 - y };
    } else out.push(r);
  }
  return out;
}

function sameLine(a: NormRect, b: NormRect): boolean {
  const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return overlap > Math.min(a.h, b.h) * 0.5;
}

/** Whether a page-space point falls inside any of the rects (with a little slack). */
export function hitRects(rects: NormRect[], x: number, y: number, slack = 0.004): boolean {
  return rects.some(
    (r) => x >= r.x - slack && x <= r.x + r.w + slack && y >= r.y - slack && y <= r.y + r.h + slack,
  );
}

/** The SVG viewBox for a page: 1000 units wide, so stroke widths read the same at any zoom. */
export const VIEW_W = 1000;
export const viewH = (ratio: number) => VIEW_W / ratio;

/** perfect-freehand outline to an SVG path, in view units. */
export function strokePath(
  points: readonly (readonly [number, number, number])[],
  width: number,
  ratio: number,
  opts: { last?: boolean } = {},
): string {
  const h = viewH(ratio);
  const pts = points.map(([x, y, p]) => [x * VIEW_W, y * h, p] as [number, number, number]);
  const outline = getStroke(pts, {
    size: Math.max(1, width * VIEW_W),
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.4,
    // A mouse reports 0.5 always; a pen or Pencil reports real pressure.
    simulatePressure: points.every(([, , p]) => p === 0.5),
    last: opts.last ?? true,
  });
  return svgPath(outline);
}

function svgPath(points: number[][]): string {
  if (points.length < 2) return "";
  const n = (v: number) => v.toFixed(2);
  const [first, ...rest] = points;
  if (!first) return "";
  let d = `M${n(first[0] ?? 0)},${n(first[1] ?? 0)} Q`;
  for (let i = 0; i < rest.length; i++) {
    const a = points[i] ?? first;
    const b = points[i + 1] ?? first;
    d += `${n(a[0] ?? 0)},${n(a[1] ?? 0)} ${n(((a[0] ?? 0) + (b[0] ?? 0)) / 2)},${n(((a[1] ?? 0) + (b[1] ?? 0)) / 2)} `;
  }
  return `${d}Z`;
}

type Shape = Extract<AnnotationPayload, { type: "shape" }>;

/** The arrow head's two wing points for a line from (x1,y1) to (x2,y2), in view units. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size = 14) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const wing = (a: number) => [x2 - size * Math.cos(angle - a), y2 - size * Math.sin(angle - a)];
  return [wing(Math.PI / 7), wing(-Math.PI / 7)] as const;
}

/** A shape's bounding box in page space (for hit testing and the list). */
export function shapeBox(s: Shape): NormRect {
  return {
    page: s.page,
    x: Math.min(s.x1, s.x2),
    y: Math.min(s.y1, s.y2),
    w: Math.abs(s.x2 - s.x1),
    h: Math.abs(s.y2 - s.y1),
  };
}

/** An ink drawing's bounding box in page space. */
export function inkBox(p: Extract<AnnotationPayload, { type: "ink" }>): NormRect {
  const xs = p.strokes.flat().map((q) => q[0]);
  const ys = p.strokes.flat().map((q) => q[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { page: p.page, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Drops points closer than `min` (page space) to the previous one, keeping the last. */
export function thinPoints(
  pts: [number, number, number][],
  min = 0.0015,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const p of pts) {
    const last = out.at(-1);
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= min) out.push(p);
  }
  const end = pts.at(-1);
  if (end && out.at(-1) !== end && out.length > 0) out.push(end);
  return out.map(([x, y, p]) => [round(clamp01(x)), round(clamp01(y)), round(clamp01(p))]);
}
