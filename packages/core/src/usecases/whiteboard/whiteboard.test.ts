import { describe, expect, it } from "vitest";
import type { BoardElement } from "../../domain/whiteboard";
import type { LlmRequest } from "../../ports/llm";
import type { WhiteboardId } from "../../shared/id";
import { CONTENT_ID, FakeLlm, fakeChapters, fakeContent, fakeSegments } from "../quiz/fakes";
import { type AskDeps, askClaude, placeBesideBoard, toBoardOps } from "./ask-claude";
import { applyOps, createBoard, listBoards } from "./boards";
import { MemActivity, MemWhiteboards, shape } from "./fakes";
import { elementBox, overlaps } from "./geometry";
import { layoutTree, mindMapElements, type TreeNode } from "./layout";
import { buildTree, generateMindMap } from "./mind-map";
import { applyOpsToElements, diffElements } from "./ops";
import { LAYOUT_RULES } from "./prompts";
import { listSourceAnchors } from "./source";

function setup(reply: (req: LlmRequest) => unknown = () => ({ summary: "", ops: [] })) {
  const whiteboards = new MemWhiteboards();
  const activity = new MemActivity();
  const llm = new FakeLlm(reply);
  const deps: AskDeps = {
    whiteboards,
    activity,
    contents: fakeContent(),
    segments: fakeSegments(),
    chapters: fakeChapters(),
    llm: async () => llm,
  };
  return { deps, whiteboards, activity, llm };
}

async function boardWith(deps: AskDeps, elements: BoardElement[] = []) {
  const r = await createBoard(deps, { contentId: CONTENT_ID, elements });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("applyOpsToElements", () => {
  const a = shape("a", 0, 0);
  const b = shape("b", 240, 0);

  it("adds, updates and removes in order", () => {
    const r = applyOpsToElements(
      [a],
      [
        { op: "add", element: b },
        { op: "add", element: { id: "ab", type: "arrow", from: "a", to: "b" } },
        { op: "update", id: "a", patch: { text: "Glycolysis", x: 8 } },
      ],
    );
    expect(r.refused).toEqual([]);
    expect(r.elements.map((e) => e.id)).toEqual(["a", "b", "ab"]);
    expect(r.elements[0]).toMatchObject({ text: "Glycolysis", x: 8 });
    // Defaults are filled in by the schema.
    expect(r.elements[2]).toMatchObject({ by: "person", color: "ink" });
  });

  it("refuses invalid operations with a reason and keeps going", () => {
    const r = applyOpsToElements(
      [a, b],
      [
        { op: "add", element: { ...a } },
        { op: "add", element: { id: "x", type: "arrow", from: "a", to: "nope" } },
        { op: "add", element: { id: "self", type: "arrow", from: "a", to: "a" } },
        { op: "update", id: "ghost", patch: { x: 1 } },
        { op: "update", id: "a", patch: { type: "sticky" } },
        { op: "update", id: "a", patch: { w: -5 } },
        { op: "explode", id: "a" },
        { op: "update", id: "b", patch: { text: "kept" } },
      ],
    );
    expect(r.refused.map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(r.refused[1]?.message).toContain("not on the board");
    expect(r.elements.find((e) => e.id === "b")).toMatchObject({ text: "kept" });
  });

  it("refuses an arrow that points at an arrow", () => {
    const r = applyOpsToElements(
      [a, b, { id: "ab", type: "arrow", by: "person", from: "a", to: "b", color: "ink" }],
      [{ op: "add", element: { id: "z", type: "arrow", from: "a", to: "ab" } }],
    );
    expect(r.refused[0]?.message).toContain("another arrow");
  });

  it("removes the arrows attached to a removed element", () => {
    const arrow: BoardElement = {
      id: "ab",
      type: "arrow",
      by: "person",
      from: "a",
      to: "b",
      color: "ink",
    };
    const r = applyOpsToElements([a, b, arrow], [{ op: "remove", id: "a" }]);
    expect(r.elements.map((e) => e.id)).toEqual(["b"]);
  });

  it("protects locked elements but lets them be unlocked", () => {
    const locked = shape("l", 0, 0, { locked: true });
    expect(applyOpsToElements([locked], [{ op: "remove", id: "l" }]).refused).toHaveLength(1);
    expect(
      applyOpsToElements([locked], [{ op: "update", id: "l", patch: { x: 9 } }]).refused,
    ).toHaveLength(1);
    const r = applyOpsToElements([locked], [{ op: "update", id: "l", patch: { locked: false } }]);
    expect(r.refused).toEqual([]);
  });

  it("clears a field with null", () => {
    const linked = shape("s", 0, 0, { source: { contentId: "c1", token: "[p.2]" } });
    const r = applyOpsToElements([linked], [{ op: "update", id: "s", patch: { source: null } }]);
    expect(r.elements[0]?.source).toBeUndefined();
  });
});

describe("diffElements", () => {
  it("round-trips: applying the diff of two boards gives the second", () => {
    const before = [shape("a", 0, 0), shape("b", 200, 0), shape("c", 400, 0)];
    const after: BoardElement[] = [
      shape("a", 16, 0, { text: "moved" }),
      shape("c", 400, 0),
      shape("d", 0, 200),
      { id: "ad", type: "arrow", by: "person", from: "a", to: "d", color: "ink" },
    ];
    const ops = diffElements(before, after);
    const r = applyOpsToElements(before, ops);
    expect(r.refused).toEqual([]);
    expect(new Set(r.elements.map((e) => e.id))).toEqual(new Set(["a", "c", "d", "ad"]));
    expect(r.elements.find((e) => e.id === "a")).toMatchObject({ x: 16, text: "moved" });
    expect(diffElements(after, after)).toEqual([]);
  });
});

describe("boards", () => {
  it("creates numbered boards and lists them", async () => {
    const { deps } = setup();
    await boardWith(deps);
    const second = await createBoard(deps, { contentId: CONTENT_ID });
    expect(second.ok && second.value.title).toBe("Board 2");
    expect(await listBoards(deps, CONTENT_ID)).toHaveLength(2);
  });

  it("applyOps saves, bumps the version and records activity once", async () => {
    const { deps, activity } = setup();
    const board = await boardWith(deps);
    const r = await applyOps(deps, {
      boardId: board.id,
      ops: [{ op: "add", element: shape("a", 0, 0) }],
    });
    expect(r.ok && r.value.version).toBe(1);
    await applyOps(deps, { boardId: board.id, ops: [{ op: "update", id: "a", patch: { x: 8 } }] });
    expect(activity.events).toEqual([{ kind: "whiteboard_edit", ref: board.id }]);
  });

  it("applyOps is all or nothing", async () => {
    const { deps, whiteboards } = setup();
    const board = await boardWith(deps, [shape("a", 0, 0)]);
    const r = await applyOps(deps, {
      boardId: board.id,
      ops: [
        { op: "update", id: "a", patch: { x: 50 } },
        { op: "remove", id: "missing" },
      ],
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toContain("Change 2");
    expect(whiteboards.rows[0]?.elements[0]).toMatchObject({ x: 0 });
    expect(whiteboards.rows[0]?.version).toBe(0);
  });

  it("retries once on a stale version, on top of the other save", async () => {
    const { deps, whiteboards } = setup();
    const board = await boardWith(deps, [shape("a", 0, 0)]);
    // Someone adds "b" between our load and our save.
    whiteboards.beforeSave = () =>
      whiteboards.bump(board.id, [shape("a", 0, 0), shape("b", 240, 0)]);
    const r = await applyOps(deps, {
      boardId: board.id,
      ops: [{ op: "update", id: "a", patch: { text: "mine" } }],
    });
    expect(r.ok).toBe(true);
    expect(whiteboards.saves).toBe(2);
    expect(r.ok && r.value.elements.map((e) => e.id)).toEqual(["a", "b"]);
    expect(r.ok && r.value.elements[0]).toMatchObject({ text: "mine" });
    expect(r.ok && r.value.version).toBe(2);
  });

  it("gives up with a conflict when the board changes twice", async () => {
    const { deps, whiteboards } = setup();
    const board = await boardWith(deps);
    const original = whiteboards.save.bind(whiteboards);
    whiteboards.save = async (id, els, v) => {
      whiteboards.bump(id);
      return original(id, els, v);
    };
    const r = await applyOps(deps, {
      boardId: board.id,
      ops: [{ op: "add", element: shape("a", 0, 0) }],
    });
    expect(!r.ok && r.error.code).toBe("conflict");
  });
});

describe("askClaude", () => {
  const sticky: BoardElement = {
    id: "mine",
    type: "sticky",
    by: "person",
    color: "yellow",
    text: "My note",
    x: 0,
    y: 0,
    w: 200,
    h: 160,
  };

  it("sends the rules, the board as JSON and the source with tokens", async () => {
    const { deps, llm } = setup();
    const board = await boardWith(deps, [sticky]);
    await askClaude(deps, { boardId: board.id, request: "Explain the Krebs cycle" });
    const req = llm.requests[0];
    expect(req?.task).toBe("chat");
    expect(req?.system).toContain(LAYOUT_RULES);
    expect(req?.system).toContain('"by":"person"');
    expect(req?.system).toContain("24-unit gap");
    expect(req?.system).toContain("at most four colours");
    expect(req?.context).toContain("[p.3] Text of page 3.");
    const msg = req?.messages[0]?.content ?? "";
    expect(msg).toContain('{"id":"mine","type":"sticky","by":"person"');
    expect(msg).toContain("<may_change>(none)</may_change>");
    expect(msg).toContain("[p.3] Krebs cycle");
    expect(msg).toContain("Explain the Krebs cycle");
  });

  it("applies Claude's ops, links sources and never touches a person's element", async () => {
    const { deps, whiteboards } = setup(() => ({
      summary: "A flow.",
      ops: [
        {
          op: "add",
          id: "s1",
          fields: { type: "shape", x: 0, y: 0, w: 160, h: 64, text: "Glucose", source: "[p.1]" },
        },
        {
          op: "add",
          id: "s2",
          fields: {
            type: "shape",
            x: 240,
            y: 0,
            w: 160,
            h: 64,
            text: "Pyruvate",
            source: "[p.99]",
          },
        },
        { op: "add", id: "a1", fields: { type: "arrow", from: "s1", to: "s2", color: "yellow" } },
        { op: "update", id: "mine", fields: { text: "overwritten" } },
        { op: "remove", id: "mine" },
      ],
    }));
    const board = await boardWith(deps, [sticky]);
    const r = await askClaude(deps, { boardId: board.id, request: "Draw glycolysis as a flow" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const els = whiteboards.rows[0]?.elements ?? [];
    expect(els.find((e) => e.id === "mine")).toEqual(sticky);
    expect(r.value.skipped).toHaveLength(2);
    expect(r.value.touched).toHaveLength(3);
    const added = els.filter((e) => e.by === "claude");
    expect(added).toHaveLength(3);
    const glucose = added.find((e) => e.type === "shape" && e.text === "Glucose");
    expect(glucose?.source).toEqual({ contentId: CONTENT_ID, token: "[p.1]" });
    // A token that points nowhere is dropped, the element kept.
    expect(added.find((e) => e.type === "shape" && e.text === "Pyruvate")?.source).toBeUndefined();
    // The fill colour named for an arrow maps to an ink colour.
    expect(added.find((e) => e.type === "arrow")).toMatchObject({ color: "terracotta" });
    // Claude drew on top of the sticky, so its group moved to the right of the board.
    for (const e of added) {
      const box = elementBox(e);
      if (box)
        expect(
          overlaps(box, elementBox(sticky) as NonNullable<ReturnType<typeof elementBox>>),
        ).toBe(false);
    }
  });

  it("changes a person's element when it was selected", async () => {
    const { deps, whiteboards } = setup(() => ({
      summary: "Reworded.",
      ops: [{ op: "update", id: "mine", fields: { text: "Better note" } }],
    }));
    const board = await boardWith(deps, [sticky]);
    const r = await askClaude(deps, {
      boardId: board.id,
      request: "Reword my note",
      mayChange: ["mine"],
    });
    expect(r.ok && r.value.touched).toEqual(["mine"]);
    expect(whiteboards.rows[0]?.elements[0]).toMatchObject({ text: "Better note", by: "person" });
  });

  it("refuses an empty request without calling the model", async () => {
    const { deps, llm } = setup();
    const board = await boardWith(deps);
    const r = await askClaude(deps, { boardId: board.id, request: "   " });
    expect(!r.ok && r.error.code).toBe("validation");
    expect(llm.requests).toHaveLength(0);
  });

  it("passes a model failure through", async () => {
    const { deps } = setup(() => ({ wrong: true }));
    const board = await boardWith(deps);
    const r = await askClaude(deps, { boardId: board.id, request: "Draw" });
    expect(!r.ok && r.error.code).toBe("llm_bad_output");
  });

  it("takes a shape's words from label when text is empty", () => {
    const { ops } = toBoardOps(
      {
        summary: "",
        ops: [
          {
            op: "add",
            id: "s",
            fields: { type: "shape", x: 0, y: 0, w: 160, h: 64, label: "ATP synthase" },
          },
        ],
      },
      [],
      { contentId: CONTENT_ID, segments: [], mayChange: new Set() },
    );
    const first = ops[0];
    expect(first?.op === "add" && first.element).toMatchObject({ text: "ATP synthase" });
  });

  it("toBoardOps renames ids so they never clash", () => {
    const { ops } = toBoardOps(
      {
        summary: "",
        ops: [{ op: "add", id: "mine", fields: { type: "text", text: "Hi", x: 0, y: 0 } }],
      },
      [sticky],
      { contentId: CONTENT_ID, segments: [], mayChange: new Set() },
    );
    const first = ops[0];
    expect(first?.op === "add" && first.element.id).not.toBe("mine");
  });

  it("placeBesideBoard leaves non-overlapping additions alone", () => {
    const ops = [{ op: "add" as const, element: shape("n", 400, 0, { by: "claude" }) }];
    expect(placeBesideBoard(ops, [shape("a", 0, 0)])).toEqual(ops);
  });
});

const tree = (label: string, children: TreeNode[] = [], id = label): TreeNode => ({
  id,
  label,
  children,
});

describe("layoutTree", () => {
  const root = tree("Cell respiration", [
    tree("Glycolysis", [tree("Glucose splits"), tree("2 ATP net"), tree("Cytoplasm")]),
    tree("Krebs cycle", [tree("Acetyl-CoA"), tree("NADH and FADH2 carry electrons onward")]),
    tree("Electron transport", [
      tree("Proton gradient", [tree("Inner membrane"), tree("Pumps")]),
      tree("ATP synthase"),
    ]),
    tree("Fermentation"),
  ]);

  it("places levels left to right in columns", () => {
    const placed = layoutTree(root);
    const byDepth = new Map<number, number[]>();
    for (const p of placed) byDepth.set(p.depth, [...(byDepth.get(p.depth) ?? []), p.x]);
    const cols = [...byDepth.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, xs] of cols) expect(new Set(xs).size).toBe(1);
    for (let i = 1; i < cols.length; i++) {
      const prev = placed.filter((p) => p.depth === i - 1);
      const right = Math.max(...prev.map((p) => p.x + p.w));
      expect(cols[i]?.[1][0]).toBeGreaterThan(right);
    }
  });

  it("never overlaps two nodes", () => {
    const placed = layoutTree(root);
    for (const a of placed) {
      for (const b of placed) {
        if (a !== b) expect(overlaps(a, b), `${a.id} / ${b.id}`).toBe(false);
      }
    }
  });

  it("centres each parent on its children and spaces siblings evenly", () => {
    const placed = layoutTree(root);
    const at = (id: string) => placed.find((p) => p.id === id);
    const centre = (id: string) => {
      const p = at(id);
      return p ? p.y + p.h / 2 : Number.NaN;
    };
    expect(centre("Glycolysis")).toBeCloseTo(
      (centre("Glucose splits") + centre("Cytoplasm")) / 2,
      0,
    );
    const leaves = ["Glucose splits", "2 ATP net", "Cytoplasm"].map((id) => at(id));
    const gaps = leaves
      .slice(1)
      .map((p, i) => (p?.y ?? 0) - ((leaves[i]?.y ?? 0) + (leaves[i]?.h ?? 0)));
    expect(new Set(gaps).size).toBe(1);
  });

  it("is deterministic", () => {
    expect(layoutTree(root)).toEqual(layoutTree(structuredClone(root)));
    expect(layoutTree(root, { x: 100, y: 50 })[0]).toMatchObject({ x: 100 });
  });

  it("turns the tree into shapes, arrows, a title and a takeaway", () => {
    const els = mindMapElements({
      root,
      title: "Respiration",
      takeaway: "How cells make ATP.",
      contentId: CONTENT_ID,
      prefix: "m1-",
    });
    const shapes = els.filter((e) => e.type === "shape");
    const arrows = els.filter((e) => e.type === "arrow");
    expect(shapes).toHaveLength(14);
    expect(arrows).toHaveLength(13);
    expect(els.filter((e) => e.type === "text")).toHaveLength(2);
    const colours = new Set(shapes.map((s) => (s.type === "shape" ? s.color : "")));
    expect(colours.size).toBeLessThanOrEqual(4);
    const r = applyOpsToElements(
      [],
      els.map((element) => ({ op: "add", element })),
    );
    expect(r.refused).toEqual([]);
  });
});

describe("generateMindMap", () => {
  it("builds a linked, laid-out map from the model's flat tree", async () => {
    const { deps, whiteboards, llm } = setup(() => ({
      title: "Cell energy",
      takeaway: "ATP is made in stages.",
      nodes: [
        { id: "r", parent: null, label: "Cell energy", source: "[p.1]" },
        { id: "a", parent: "r", label: "ATP", source: "[p.1]" },
        { id: "b", parent: "r", label: "Krebs cycle.", source: "[p.3]" },
        { id: "b1", parent: "b", label: "Citrate", source: "[p.4]" },
        { id: "loop", parent: "loop", label: "Cycle", source: "[p.2]" },
        { id: "bad", parent: "a", label: "Nowhere", source: "[p.77]" },
      ],
    }));
    const board = await boardWith(deps);
    const r = await generateMindMap(deps, { boardId: board.id, focus: "energy" });
    expect(r.ok).toBe(true);
    expect(llm.requests[0]?.messages[0]?.content).toContain("focused on: energy");
    expect(llm.requests[0]?.system).toContain("Every node gets");
    const els = whiteboards.rows[0]?.elements ?? [];
    const shapes = els.filter((e) => e.type === "shape");
    expect(shapes.map((s) => (s.type === "shape" ? s.text : ""))).toEqual([
      "Cell energy",
      "ATP",
      "Nowhere",
      "Krebs cycle",
      "Citrate",
    ]);
    expect(shapes.find((s) => s.type === "shape" && s.text === "Citrate")?.source?.token).toBe(
      "[p.4]",
    );
    expect(shapes.find((s) => s.type === "shape" && s.text === "Nowhere")?.source).toBeUndefined();
    expect(els.every((e) => e.by === "claude")).toBe(true);
  });

  it("goes below what is already on the board", async () => {
    const { deps, whiteboards } = setup(() => ({
      title: "Map",
      takeaway: "",
      nodes: [
        { id: "r", parent: null, label: "Root" },
        { id: "a", parent: "r", label: "Child" },
      ],
    }));
    const board = await boardWith(deps, [shape("mine", 0, 0)]);
    await generateMindMap(deps, { boardId: board.id });
    const els = whiteboards.rows[0]?.elements ?? [];
    const added = els.filter((e) => e.by === "claude");
    for (const e of added) {
      const box = elementBox(e);
      if (box) expect(box.y).toBeGreaterThan(64);
    }
  });

  it("buildTree makes a root from the title when there are several", () => {
    const t = buildTree(
      {
        title: "Two themes",
        takeaway: "",
        nodes: [
          { id: "a", parent: null, label: "A" },
          { id: "b", parent: null, label: "B" },
        ],
      },
      { contentId: CONTENT_ID, segments: [] },
    );
    expect(t?.label).toBe("Two themes");
    expect(t?.children.map((c) => c.label)).toEqual(["A", "B"]);
  });

  it("fails when the model returns no branches", async () => {
    const { deps } = setup(() => ({ title: "", takeaway: "", nodes: [] }));
    const board = await boardWith(deps);
    const r = await generateMindMap(deps, { boardId: board.id as WhiteboardId });
    expect(!r.ok && r.error.code).toBe("llm_bad_output");
  });
});

describe("listSourceAnchors", () => {
  it("lists chapters, then every page", async () => {
    const { deps } = setup();
    const anchors = await listSourceAnchors(deps, CONTENT_ID);
    expect(anchors.slice(0, 2)).toEqual([
      { token: "[p.1]", label: "Page 1", preview: "ATP", chapter: true },
      { token: "[p.3]", label: "Page 3", preview: "Krebs cycle", chapter: true },
    ]);
    expect(anchors.filter((a) => !a.chapter).map((a) => a.token)).toEqual([
      "[p.1]",
      "[p.2]",
      "[p.3]",
      "[p.4]",
    ]);
  });
});
