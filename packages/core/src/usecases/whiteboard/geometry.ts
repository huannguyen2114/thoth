import type { BoardElement } from "../../domain/whiteboard";

/** An axis-aligned box in board units. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The layout grid: gaps between elements are multiples of this (doc 18). */
export const GRID = 24;

/** Font size and line height per text size, in board units. Mirrors the canvas CSS. */
export const textMetrics = {
  small: { font: 13, line: 18 },
  body: { font: 15, line: 22 },
  large: { font: 20, line: 26 },
  title: { font: 24, line: 30 },
  huge: { font: 40, line: 46 },
} as const;
export type TextSize = keyof typeof textMetrics;

/** Average glyph width as a share of the font size (Geist, mixed case). */
const GLYPH = 0.56;

/** A deterministic width estimate. Core cannot measure fonts, so layout uses this. */
export function textWidth(text: string, size: TextSize): number {
  const longest = text.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
  return Math.ceil(longest * textMetrics[size].font * GLYPH);
}

/** How many lines `text` needs at `width` units, wrapping on words. */
export function lineCount(text: string, size: TextSize, width: number): number {
  const per = Math.max(1, Math.floor(width / (textMetrics[size].font * GLYPH)));
  let lines = 0;
  for (const para of text.split("\n")) {
    let used = 0;
    let n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const len = word.length;
      if (used === 0) used = len;
      else if (used + 1 + len <= per) used += 1 + len;
      else {
        n += 1;
        used = len;
      }
      while (used > per) {
        n += 1;
        used -= per;
      }
    }
    lines += n;
  }
  return Math.max(1, lines);
}

export const TABLE_ROW_H = 36;
export const TABLE_COL_W = 140;

/**
 * The box an element covers. Arrows have no box of their own (null): they follow their ends.
 */
export function elementBox(el: BoardElement): Box | null {
  switch (el.type) {
    case "arrow":
      return null;
    case "text": {
      const w = el.wrap ?? Math.max(GRID, textWidth(el.text || " ", el.size));
      const h = lineCount(el.text || " ", el.size, w) * textMetrics[el.size].line;
      return { x: el.x, y: el.y, w, h };
    }
    case "table": {
      const cols = Math.max(...el.rows.map((r) => r.length), 1);
      const widths = Array.from({ length: cols }, (_, i) => el.colWidths?.[i] ?? TABLE_COL_W);
      return {
        x: el.x,
        y: el.y,
        w: widths.reduce((a, b) => a + b, 0),
        h: el.rows.length * TABLE_ROW_H,
      };
    }
    default:
      return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
}

export function overlaps(a: Box, b: Box, margin = 0): boolean {
  return (
    a.x < b.x + b.w + margin &&
    b.x < a.x + a.w + margin &&
    a.y < b.y + b.h + margin &&
    b.y < a.y + a.h + margin
  );
}

/** Whether `inner` lies fully inside `outer`. */
export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/** The box around several boxes, or null for none. */
export function unionBox(boxes: readonly (Box | null)[]): Box | null {
  let out: Box | null = null;
  for (const b of boxes) {
    if (!b) continue;
    if (!out) {
      out = { ...b };
      continue;
    }
    const x = Math.min(out.x, b.x);
    const y = Math.min(out.y, b.y);
    out = {
      x,
      y,
      w: Math.max(out.x + out.w, b.x + b.w) - x,
      h: Math.max(out.y + out.h, b.y + b.h) - y,
    };
  }
  return out;
}

export function boardBounds(elements: readonly BoardElement[]): Box | null {
  return unionBox(elements.map(elementBox));
}
