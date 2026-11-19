import type { BoardElement, boardColors, inkColors } from "../../domain/whiteboard";
import { type Box, GRID, lineCount, type TextSize, textMetrics, textWidth } from "./geometry";

/** One node of a concept tree, after core has checked the model's flat list. */
export interface TreeNode {
  id: string;
  label: string;
  /** A citation token like "[p.3]", already checked against the source. */
  source?: string;
  children: TreeNode[];
}

export interface PlacedNode extends Box {
  id: string;
  depth: number;
  size: TextSize;
}

/** Sizes per depth: the root is larger, leaves are compact. */
type Level = { size: TextSize; min: number; max: number };
const LEVELS: [Level, ...Level[]] = [
  { size: "large", min: 168, max: 264 },
  { size: "body", min: 144, max: 240 },
  { size: "body", min: 120, max: 216 },
  { size: "small", min: 112, max: 192 },
];
const level = (depth: number): Level => LEVELS[Math.min(depth, LEVELS.length - 1)] ?? LEVELS[0];

export const TREE_LAYOUT = {
  /** Horizontal space between levels, for the connectors. */
  levelGap: GRID * 4,
  /** Vertical space between siblings. */
  siblingGap: GRID,
  /** Extra space between the big branches, so each reads as a group. */
  branchGap: GRID,
  padX: 16,
  padY: 12,
  minH: 48,
};

function nodeSize(label: string, depth: number): { w: number; h: number; size: TextSize } {
  const { size, min, max } = level(depth);
  const inner = Math.min(max, Math.max(min, textWidth(label, size) + TREE_LAYOUT.padX * 2));
  const w = Math.ceil(inner / 8) * 8;
  const lines = lineCount(label, size, w - TREE_LAYOUT.padX * 2);
  const h = Math.max(TREE_LAYOUT.minH, lines * textMetrics[size].line + TREE_LAYOUT.padY * 2);
  return { w, h: Math.ceil(h / 4) * 4, size };
}

/**
 * A tidy, horizontal tree layout (doc 18):
 *
 * - levels run left to right; every node of one level shares a column, as wide as its widest node;
 * - each subtree owns a horizontal band; bands of siblings are stacked with an even gap, so no
 *   two nodes can overlap;
 * - a parent sits centred on its children (balanced), and a leafy parent taller than its
 *   children centres them instead.
 *
 * Deterministic: the same tree always gives the same positions. The root's top left is (x, y).
 */
export function layoutTree(root: TreeNode, origin = { x: 0, y: 0 }): PlacedNode[] {
  const sizes = new Map<string, { w: number; h: number; size: TextSize; depth: number }>();
  const colW: number[] = [];
  const measure = (n: TreeNode, depth: number) => {
    const s = nodeSize(n.label, depth);
    sizes.set(n.id, { ...s, depth });
    colW[depth] = Math.max(colW[depth] ?? 0, s.w);
    for (const c of n.children) measure(c, depth + 1);
  };
  measure(root, 0);

  const colX: number[] = [origin.x];
  for (let d = 1; d < colW.length; d++) {
    colX[d] = (colX[d - 1] ?? 0) + (colW[d - 1] ?? 0) + TREE_LAYOUT.levelGap;
  }

  const gapAfter = (depth: number) =>
    TREE_LAYOUT.siblingGap + (depth === 1 ? TREE_LAYOUT.branchGap : 0);

  const bandH = new Map<string, number>();
  const band = (n: TreeNode): number => {
    const own = sizes.get(n.id)?.h ?? 0;
    const depth = sizes.get(n.id)?.depth ?? 0;
    let kids = 0;
    n.children.forEach((c, i) => {
      kids += band(c) + (i > 0 ? gapAfter(depth + 1) : 0);
    });
    const h = Math.max(own, kids);
    bandH.set(n.id, h);
    return h;
  };
  band(root);

  const out: PlacedNode[] = [];
  const place = (n: TreeNode, top: number): number => {
    const s = sizes.get(n.id);
    if (!s) return 0;
    const total = bandH.get(n.id) ?? s.h;
    let y: number;
    if (n.children.length === 0) {
      y = top + (total - s.h) / 2;
    } else {
      const kidsH = n.children.reduce(
        (sum, c, i) => sum + (bandH.get(c.id) ?? 0) + (i > 0 ? gapAfter(s.depth + 1) : 0),
        0,
      );
      let cursor = top + (total - kidsH) / 2;
      const centres: number[] = [];
      n.children.forEach((c, i) => {
        if (i > 0) cursor += gapAfter(s.depth + 1);
        centres.push(place(c, cursor));
        cursor += bandH.get(c.id) ?? 0;
      });
      const mid = ((centres[0] ?? 0) + (centres.at(-1) ?? 0)) / 2;
      y = mid - s.h / 2;
    }
    y = Math.round(y);
    out.push({ id: n.id, depth: s.depth, size: s.size, x: colX[s.depth] ?? 0, y, w: s.w, h: s.h });
    return y + s.h / 2;
  };
  place(root, origin.y);
  // Parents before children (a stable order for z-order and tests).
  return out.sort((a, b) => a.depth - b.depth || a.y - b.y);
}

type Fill = (typeof boardColors)[number];
type Ink = (typeof inkColors)[number];

/** At most four colours on a mind map: the root, then three for the branches. */
const ROOT_FILL: Fill = "peach";
const BRANCH_FILLS: Fill[] = ["green", "blue", "purple"];
const BRANCH_INK: Record<string, Ink> = { green: "green", blue: "blue", purple: "purple" };

/**
 * Turns a laid-out tree into board elements: a title, a one-line takeaway, a shape per node
 * and an arrow from each parent to each child. Node ids get `prefix` so they never clash.
 */
export function mindMapElements(input: {
  root: TreeNode;
  title: string;
  takeaway: string;
  contentId: string;
  prefix: string;
  origin?: { x: number; y: number };
}): BoardElement[] {
  const origin = input.origin ?? { x: 0, y: 0 };
  const titleH = textMetrics.title.line;
  const takeawayH = textMetrics.body.line;
  const treeTop = origin.y + titleH + takeawayH + GRID * 2;
  const placed = layoutTree(input.root, { x: origin.x, y: treeTop });
  const at = new Map(placed.map((p) => [p.id, p]));
  const id = (raw: string) =>
    `${input.prefix}${raw}`.replace(/[^A-Za-z0-9_.~:@+-]/g, "_").slice(0, 40);

  const branchOf = new Map<string, Fill>();
  input.root.children.forEach((b, i) => {
    const fill = BRANCH_FILLS[i % BRANCH_FILLS.length] ?? "green";
    const mark = (n: TreeNode) => {
      branchOf.set(n.id, fill);
      n.children.forEach(mark);
    };
    mark(b);
  });

  const link = (token?: string) => (token ? { contentId: input.contentId, token } : undefined);
  const shapes: BoardElement[] = [];
  const arrows: BoardElement[] = [];
  const walk = (n: TreeNode) => {
    const p = at.get(n.id);
    if (!p) return;
    const fill = p.depth === 0 ? ROOT_FILL : (branchOf.get(n.id) ?? "green");
    const source = link(n.source);
    shapes.push({
      id: id(n.id),
      type: "shape",
      by: "claude",
      kind: p.depth === 0 ? "pill" : p.depth === 1 ? "rounded" : "rect",
      color: fill,
      text: n.label,
      size: p.size === "huge" ? "title" : p.size,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      ...(source ? { source } : {}),
    });
    for (const c of n.children) {
      arrows.push({
        id: id(`${n.id}~${c.id}`),
        type: "arrow",
        by: "claude",
        from: id(n.id),
        to: id(c.id),
        color: p.depth === 0 ? "ink" : (BRANCH_INK[branchOf.get(c.id) ?? ""] ?? "ink"),
      });
      walk(c);
    }
  };
  walk(input.root);

  const head: BoardElement[] = [
    {
      id: id("title"),
      type: "text",
      by: "claude",
      text: input.title,
      size: "title",
      color: "ink",
      x: origin.x,
      y: origin.y,
    },
  ];
  if (input.takeaway) {
    head.push({
      id: id("takeaway"),
      type: "text",
      by: "claude",
      text: input.takeaway,
      size: "body",
      color: "ink",
      x: origin.x,
      y: origin.y + titleH + GRID / 3,
      wrap: 640,
    });
  }
  return [...head, ...shapes, ...arrows];
}
