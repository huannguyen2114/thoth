import type { BoardElement } from "@thoth/core";
import { describe, expect, it } from "vitest";
import {
  cloneElements,
  fitBox,
  hitTest,
  idsInArea,
  newElement,
  roundedPath,
  routeArrow,
  toBoard,
  zoomAt,
} from "./model";

const box = (x: number, y: number, w = 100, h = 50) => ({ x, y, w, h });

describe("routeArrow", () => {
  it("connects side by side boxes right to left with one jog", () => {
    const r = routeArrow(box(0, 0), box(200, 100));
    expect(r.from).toBe("right");
    expect(r.to).toBe("left");
    expect(r.points).toEqual([
      { x: 100, y: 25 },
      { x: 150, y: 25 },
      { x: 150, y: 125 },
      { x: 200, y: 125 },
    ]);
  });

  it("is a straight line when the boxes line up", () => {
    expect(routeArrow(box(0, 0), box(300, 0)).points).toHaveLength(2);
  });

  it("connects stacked boxes bottom to top", () => {
    const r = routeArrow(box(0, 0), box(20, 200));
    expect([r.from, r.to]).toEqual(["bottom", "top"]);
    expect(
      r.points.every((p, i, all) => i === 0 || p.x === all[i - 1]?.x || p.y === all[i - 1]?.y),
    ).toBe(true);
  });

  it("goes leftwards when the target is to the left", () => {
    const r = routeArrow(box(300, 0), box(0, 0));
    expect([r.from, r.to]).toEqual(["left", "right"]);
  });
});

describe("viewport", () => {
  it("zooms around the pointer", () => {
    const v = { x: 10, y: 20, zoom: 1 };
    const at = { x: 110, y: 120 };
    const before = toBoard(v, at);
    const after = toBoard(zoomAt(v, at, 2), at);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("fits a box inside the screen, never above 100%", () => {
    const v = fitBox(box(0, 0, 2000, 1000), 1000, 600, 50);
    expect(v.zoom).toBeCloseTo(0.45);
    expect(fitBox(box(0, 0, 10, 10), 1000, 600).zoom).toBe(1);
  });
});

describe("selection helpers", () => {
  const a = newElement("shape", { x: 80, y: 32 });
  const b = newElement("shape", { x: 480, y: 32 });
  const section = { ...newElement("section", { x: 240, y: 160 }) };
  const arrow: BoardElement = {
    id: "ab",
    type: "arrow",
    by: "person",
    from: a.id,
    to: b.id,
    color: "ink",
  };
  const els = [section, a, b, arrow];

  it("marquee picks what it touches, and arrows whose ends are picked", () => {
    expect(idsInArea(els, box(0, 0, 600, 40)).sort()).toEqual([a.id, b.id, "ab"].sort());
    expect(idsInArea(els, box(0, 0, 100, 40))).toEqual([a.id]);
  });

  it("hit test prefers content over the section behind it", () => {
    expect(hitTest(els, { x: 80, y: 32 })?.id).toBe(a.id);
    expect(hitTest(els, { x: 240, y: 300 })?.id).toBe(section.id);
    expect(hitTest(els, { x: 5000, y: 0 })).toBeNull();
  });

  it("copies get new ids and arrows follow them", () => {
    const copies = cloneElements([a, b, arrow]);
    const ids = new Set(copies.map((c) => c.id));
    expect(ids.has(a.id)).toBe(false);
    const copiedArrow = copies.find((c) => c.type === "arrow");
    expect(copiedArrow?.type === "arrow" && ids.has(copiedArrow.from)).toBe(true);
    // An arrow whose ends are not copied is left out.
    expect(cloneElements([a, arrow]).some((c) => c.type === "arrow")).toBe(false);
  });
});

describe("roundedPath", () => {
  it("rounds corners and ends on the last point", () => {
    const d = roundedPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]);
    expect(d.startsWith("M0,0")).toBe(true);
    expect(d).toContain("Q50,0");
    expect(d.endsWith("L50,50")).toBe(true);
  });
});

describe("routeArrow in a tree", () => {
  it("links a parent to a far-away child sideways", () => {
    const r = routeArrow(box(0, 400), box(200, 0));
    expect([r.from, r.to]).toEqual(["right", "left"]);
  });
});
