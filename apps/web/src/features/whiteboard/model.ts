import { type BoardElement, type Box, elementBox, GRID } from "@thoth/core";

/** Pure helpers of the canvas: geometry, arrow routing, new elements. Tested in model.test.ts. */

export interface Point {
  x: number;
  y: number;
}
export interface Viewport {
  /** Screen offset of board (0, 0), in CSS pixels. */
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;
export const SNAP = 8;

export const snap = (n: number) => Math.round(n / SNAP) * SNAP;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const toBoard = (v: Viewport, p: Point): Point => ({
  x: (p.x - v.x) / v.zoom,
  y: (p.y - v.y) / v.zoom,
});

/** Zooms by `factor` keeping the board point under `at` (screen) still. */
export function zoomAt(v: Viewport, at: Point, factor: number): Viewport {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k };
}

/** A viewport that shows `box` inside a `w` × `h` screen with `pad` pixels around it. */
export function fitBox(box: Box | null, w: number, h: number, pad = 48, maxZoom = 1): Viewport {
  if (!box || w <= 0 || h <= 0) return { x: pad, y: pad, zoom: 1 };
  const zoom = clampZoom(
    Math.min((w - pad * 2) / Math.max(box.w, 1), (h - pad * 2) / Math.max(box.h, 1), maxZoom),
  );
  return {
    zoom,
    x: (w - box.w * zoom) / 2 - box.x * zoom,
    y: (h - box.h * zoom) / 2 - box.y * zoom,
  };
}

export const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export type Side = "left" | "right" | "top" | "bottom";

export function sidePoint(b: Box, side: Side): Point {
  switch (side) {
    case "left":
      return { x: b.x, y: b.y + b.h / 2 };
    case "right":
      return { x: b.x + b.w, y: b.y + b.h / 2 };
    case "top":
      return { x: b.x + b.w / 2, y: b.y };
    case "bottom":
      return { x: b.x + b.w / 2, y: b.y + b.h };
  }
}

export interface Route {
  points: Point[];
  /** Where a label sits: the middle of the middle segment. */
  mid: Point;
  from: Side;
  to: Side;
}

/**
 * A right-angle connector from box `a` to box `b`, between facing sides (doc 18). Boxes apart
 * horizontally connect right→left with one vertical jog halfway; boxes stacked vertically
 * connect bottom→top the same way. Side by side wins whenever the boxes are clearly apart
 * horizontally (48 units), so a left-to-right tree or flow never turns into vertical links.
 */
export function routeArrow(a: Box, b: Box): Route {
  const hGap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const vGap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  const ca = centre(a);
  const cb = centre(b);
  if (hGap >= Math.min(vGap, 48)) {
    const right = cb.x >= ca.x;
    const s = sidePoint(a, right ? "right" : "left");
    const e = sidePoint(b, right ? "left" : "right");
    const midX = (s.x + e.x) / 2;
    const points =
      Math.abs(s.y - e.y) < 1 ? [s, e] : [s, { x: midX, y: s.y }, { x: midX, y: e.y }, e];
    return {
      points,
      mid: { x: midX, y: (s.y + e.y) / 2 },
      from: right ? "right" : "left",
      to: right ? "left" : "right",
    };
  }
  const down = cb.y >= ca.y;
  const s = sidePoint(a, down ? "bottom" : "top");
  const e = sidePoint(b, down ? "top" : "bottom");
  const midY = (s.y + e.y) / 2;
  const points =
    Math.abs(s.x - e.x) < 1 ? [s, e] : [s, { x: s.x, y: midY }, { x: e.x, y: midY }, e];
  return {
    points,
    mid: { x: (s.x + e.x) / 2, y: midY },
    from: down ? "bottom" : "top",
    to: down ? "top" : "bottom",
  };
}

/** An SVG path through `points` with softly rounded corners. */
export function roundedPath(points: readonly Point[], radius = 10): string {
  const [first, ...rest] = points;
  if (!first) return "";
  let d = `M${first.x},${first.y}`;
  for (let i = 0; i < rest.length; i++) {
    const p = rest[i] as Point;
    const prev = (i === 0 ? first : rest[i - 1]) as Point;
    const next = rest[i + 1];
    if (!next) {
      d += ` L${p.x},${p.y}`;
      break;
    }
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a = {
      x: p.x - ((p.x - prev.x) / (inLen || 1)) * r,
      y: p.y - ((p.y - prev.y) / (inLen || 1)) * r,
    };
    const b = {
      x: p.x + ((next.x - p.x) / (outLen || 1)) * r,
      y: p.y + ((next.y - p.y) / (outLen || 1)) * r,
    };
    d += ` L${a.x},${a.y} Q${p.x},${p.y} ${b.x},${b.y}`;
  }
  return d;
}

export type AddKind = "shape" | "sticky" | "text" | "section";

let counter = 0;
/** Short, unique ids for elements a person adds. */
export function newElementId(): string {
  counter = (counter + 1) % 1296;
  return `p${Date.now().toString(36)}${counter.toString(36)}`;
}

/** A new element of `kind` centred on `at` (board units), snapped to the grid. */
export function newElement(kind: AddKind, at: Point): BoardElement {
  const id = newElementId();
  switch (kind) {
    case "shape":
      return {
        id,
        type: "shape",
        by: "person",
        kind: "rounded",
        color: "green",
        text: "",
        size: "body",
        x: snap(at.x - 80),
        y: snap(at.y - 32),
        w: 160,
        h: 64,
      };
    case "sticky":
      return {
        id,
        type: "sticky",
        by: "person",
        color: "yellow",
        text: "",
        x: snap(at.x - 100),
        y: snap(at.y - 80),
        w: 200,
        h: 160,
      };
    case "text":
      return {
        id,
        type: "text",
        by: "person",
        text: "",
        size: "body",
        color: "ink",
        x: snap(at.x - 60),
        y: snap(at.y - 11),
        wrap: 240,
      };
    case "section":
      return {
        id,
        type: "section",
        by: "person",
        title: "Section",
        color: "white",
        x: snap(at.x - 240),
        y: snap(at.y - 160),
        w: 480,
        h: 320,
      };
  }
}

/** The editable text of an element, and the field it lives in. */
export function textOf(
  el: BoardElement,
): { field: "text" | "title" | "label"; value: string } | null {
  switch (el.type) {
    case "shape":
    case "sticky":
    case "text":
      return { field: "text", value: el.text };
    case "section":
      return { field: "title", value: el.title };
    case "arrow":
      return { field: "label", value: el.label ?? "" };
    default:
      return null;
  }
}

/** Elements whose box meets `area` (marquee selection). Arrows join when both ends do. */
export function idsInArea(elements: readonly BoardElement[], area: Box): string[] {
  const inside = new Set<string>();
  for (const e of elements) {
    const b = elementBox(e);
    if (!b) continue;
    const meets =
      b.x < area.x + area.w && area.x < b.x + b.w && b.y < area.y + area.h && area.y < b.y + b.h;
    // A section is picked only when the marquee covers it entirely, so dragging inside one
    // selects its contents, not the section.
    const covered =
      b.x >= area.x &&
      b.y >= area.y &&
      b.x + b.w <= area.x + area.w &&
      b.y + b.h <= area.y + area.h;
    if (e.type === "section" ? covered : meets) inside.add(e.id);
  }
  for (const e of elements) {
    if (e.type === "arrow" && inside.has(e.from) && inside.has(e.to)) inside.add(e.id);
  }
  return [...inside];
}

/** The topmost element under a board point (sections last, so content inside wins). */
export function hitTest(elements: readonly BoardElement[], p: Point): BoardElement | null {
  let section: BoardElement | null = null;
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i] as BoardElement;
    const b = elementBox(e);
    if (!b) continue;
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      if (e.type !== "section") return e;
      section ??= e;
    }
  }
  return section;
}

/** Copies of `elements` with new ids, moved by `offset`; arrows follow their copied ends. */
export function cloneElements(elements: readonly BoardElement[], offset = GRID): BoardElement[] {
  const ids = new Map(elements.map((e) => [e.id, newElementId()]));
  const out: BoardElement[] = [];
  for (const e of elements) {
    const id = ids.get(e.id) as string;
    if (e.type === "arrow") {
      const from = ids.get(e.from);
      const to = ids.get(e.to);
      if (from && to) out.push({ ...e, id, from, to, by: "person" });
      continue;
    }
    out.push({ ...e, id, by: "person", x: e.x + offset, y: e.y + offset } as BoardElement);
  }
  return out;
}

/** "[p.3]" → "p.3" for a badge. */
export const badgeLabel = (token: string) => token.slice(1, -1);
