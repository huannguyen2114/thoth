import type { SerializedDockview } from "dockview";
import { describe, expect, it } from "vitest";
import {
  clearLayout,
  LAYOUT_STORAGE_KEY,
  LAYOUT_VERSION,
  layoutPanelIds,
  loadLayout,
  PRESETS,
  parseSavedLayout,
  saveLayout,
  serializeLayout,
} from "./layout";
import { WORKSPACE_PANEL_IDS } from "./panel-ids";

const panel = (id: string) => ({ id, contentComponent: id, title: id });

function dock(ids: string[] = ["source", "chat"]): SerializedDockview {
  return {
    grid: {
      root: { type: "branch", data: [], size: 800 },
      height: 800,
      width: 1200,
      orientation: "HORIZONTAL",
    },
    panels: Object.fromEntries(ids.map((id) => [id, panel(id)])),
    activeGroup: "1",
  } as unknown as SerializedDockview;
}

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("layout (de)serialisation", () => {
  it("round-trips a layout", () => {
    const saved = dock(["source", "notes", "quiz"]);
    expect(parseSavedLayout(serializeLayout(saved))).toEqual(saved);
  });

  it("stores the version with the layout", () => {
    expect(JSON.parse(serializeLayout(dock())).v).toBe(LAYOUT_VERSION);
  });

  it("drops floating and popout groups", () => {
    const withExtras = { ...dock(), floatingGroups: [{}], popoutGroups: [{}] };
    const parsed = parseSavedLayout(JSON.stringify({ v: LAYOUT_VERSION, dock: withExtras }));
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("floatingGroups");
    expect(parsed).not.toHaveProperty("popoutGroups");
  });

  it("lists the panels in a layout", () => {
    expect(layoutPanelIds(dock(["source", "quiz"]))).toEqual(["source", "quiz"]);
  });
});

describe("layout fallback", () => {
  const wrap = (d: unknown, v: unknown = LAYOUT_VERSION) => JSON.stringify({ v, dock: d });

  it.each([
    ["nothing saved", null],
    ["an empty string", ""],
    ["broken JSON", "{not json"],
    ["a bare array", "[]"],
    ["another version", wrap(dock(), 99)],
    ["no version", JSON.stringify({ dock: dock() })],
    ["no grid", wrap({ panels: { source: panel("source") } })],
    ["a grid without a root", wrap({ ...dock(), grid: { width: 1 } })],
    ["no panels", wrap({ ...dock(), panels: {} })],
    ["an unknown panel", wrap(dock(["source", "whiteboard"]))],
    [
      "a panel whose component differs from its id",
      wrap({ ...dock(), panels: { source: { id: "source", contentComponent: "chat" } } }),
    ],
  ])("returns null for %s", (_, raw) => {
    expect(parseSavedLayout(raw as string | null)).toBeNull();
  });

  it("treats storage that throws as empty", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(loadLayout(throwing)).toBeNull();
    expect(loadLayout(undefined)).toBeNull();
  });

  it("reports a failed save instead of throwing", () => {
    const full = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(saveLayout(full, dock())).toBe(false);
    expect(saveLayout(undefined, dock())).toBe(false);
  });

  it("saves, loads and clears through storage", () => {
    const s = new MemoryStorage();
    expect(saveLayout(s, dock(["source", "notes"]))).toBe(true);
    expect(s.map.has(LAYOUT_STORAGE_KEY)).toBe(true);
    expect(layoutPanelIds(loadLayout(s) as SerializedDockview)).toEqual(["source", "notes"]);
    clearLayout(s);
    expect(loadLayout(s)).toBeNull();
  });
});

describe("presets", () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))("%s is well formed", (_, preset) => {
    const added = new Set<string>();
    for (const [i, step] of preset.steps.entries()) {
      expect(WORKSPACE_PANEL_IDS).toContain(step.id);
      expect(added.has(step.id)).toBe(false);
      if (i === 0) expect(step.at).toBeUndefined();
      else expect(added.has(step.at?.ref ?? "")).toBe(true);
      if (step.size !== undefined) expect(step.size).toBeGreaterThan(0);
      if (step.size !== undefined) expect(step.size).toBeLessThan(1);
      added.add(step.id);
    }
    expect(added.has("source")).toBe(true);
  });

  it("the Quiz preset puts Notes above the Quiz, beside the source", () => {
    const quiz = PRESETS.find((p) => p.id === "quiz");
    expect(quiz?.steps).toContainEqual(
      expect.objectContaining({ id: "notes", at: { ref: "quiz", direction: "above" } }),
    );
    expect(quiz?.steps).toContainEqual(
      expect.objectContaining({ id: "quiz", at: { ref: "source", direction: "right" } }),
    );
  });

  it("the Study preset opens every panel", () => {
    const study = PRESETS.find((p) => p.id === "study");
    expect(study?.steps.map((s) => s.id).sort()).toEqual([...WORKSPACE_PANEL_IDS].sort());
  });
});
