import type { SerializedDockview } from "dockview";
import { afterEach, describe, expect, it, vi } from "vitest";
import { presetById } from "./layout";
import {
  applyPreset,
  type DockApi,
  openPanel,
  PANEL_MIN_WIDTH,
  restoreLayout,
  revealSource,
  withMinimumSizes,
} from "./layout-actions";

interface FakePanel {
  id: string;
  title: string;
  visible: boolean;
  active: boolean;
}

/** Just enough of DockviewApi to drive the layout actions. */
function fakeDock(opts: { fromJSON?: (d: SerializedDockview) => string[] } = {}) {
  const panels: FakePanel[] = [];
  const added: Record<string, unknown>[] = [];
  let maximized = false;
  const view = (p: FakePanel) => ({
    id: p.id,
    api: {
      get isVisible() {
        return p.visible;
      },
      setActive: () => {
        p.active = true;
        p.visible = true;
      },
      setTitle: (t: string) => {
        p.title = t;
      },
    },
  });
  const api = {
    width: 1000,
    height: 800,
    get panels() {
      return panels.map(view);
    },
    getPanel: (id: string) => {
      const p = panels.find((x) => x.id === id);
      return p ? view(p) : undefined;
    },
    addPanel: (o: Record<string, unknown>) => {
      added.push(o);
      const p = { id: String(o.id), title: String(o.title), visible: true, active: false };
      panels.push(p);
      return view(p);
    },
    clear: () => {
      panels.length = 0;
    },
    fromJSON: (d: SerializedDockview) => {
      const ids = opts.fromJSON ? opts.fromJSON(d) : Object.keys(d.panels);
      panels.length = 0;
      for (const id of ids) panels.push({ id, title: "old", visible: true, active: false });
    },
    hasMaximizedGroup: () => maximized,
    exitMaximizedGroup: () => {
      maximized = false;
    },
  };
  return {
    api: api as unknown as DockApi,
    panels,
    added,
    maximize: () => {
      maximized = true;
    },
    isMaximized: () => maximized,
  };
}

const saved = (ids: string[]) =>
  ({
    grid: { root: { type: "branch", data: [] }, width: 1, height: 1, orientation: "HORIZONTAL" },
    panels: Object.fromEntries(ids.map((id) => [id, { id, contentComponent: id }])),
  }) as unknown as SerializedDockview;

afterEach(() => vi.restoreAllMocks());

describe("applyPreset", () => {
  it("builds the Quiz preset: notes above the quiz, beside the source", () => {
    const d = fakeDock();
    applyPreset(d.api, presetById("quiz"), "youtube");
    expect(d.panels.map((p) => p.id)).toEqual(["source", "quiz", "notes"]);
    expect(d.added[1]).toMatchObject({
      position: { referencePanel: "source", direction: "right" },
      initialWidth: 450,
    });
    expect(d.added[2]).toMatchObject({
      position: { referencePanel: "quiz", direction: "above" },
      initialHeight: 320,
    });
  });

  it("keeps the source rendered while hidden, gives panels a minimum size and kind titles", () => {
    const d = fakeDock();
    applyPreset(d.api, presetById("study"), "pdf");
    expect(d.added[0]).toMatchObject({ id: "source", title: "PDF", renderer: "always" });
    expect(d.added.every((o) => o.minimumWidth === PANEL_MIN_WIDTH)).toBe(true);
    expect(d.added.find((o) => o.id === "transcript")).toMatchObject({ title: "Text" });
    expect(d.panels.find((p) => p.id === "source")?.active).toBe(true);
  });

  it("clears what was there first", () => {
    const d = fakeDock();
    d.api.addPanel({ id: "chat", component: "chat" });
    applyPreset(d.api, presetById("watch"), "youtube");
    expect(d.panels.filter((p) => p.id === "chat")).toHaveLength(0);
  });
});

describe("restoreLayout", () => {
  it("uses a saved layout and retitles its panels for this content", () => {
    const d = fakeDock();
    expect(restoreLayout(d.api, saved(["source", "transcript"]), presetById("study"), "text")).toBe(
      true,
    );
    expect(d.panels.map((p) => [p.id, p.title])).toEqual([
      ["source", "Source"],
      ["transcript", "Text"],
    ]);
  });

  it("falls back to the preset when nothing is saved", () => {
    const d = fakeDock();
    expect(restoreLayout(d.api, null, presetById("quiz"), "youtube")).toBe(false);
    expect(d.panels.map((p) => p.id)).toEqual(["source", "quiz", "notes"]);
  });

  it("falls back to the preset when dockview rejects the saved layout", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = fakeDock({
      fromJSON: () => {
        throw new Error("bad layout");
      },
    });
    expect(restoreLayout(d.api, saved(["source"]), presetById("quiz"), "youtube")).toBe(false);
    expect(d.panels.map((p) => p.id)).toEqual(["source", "quiz", "notes"]);
  });

  it("falls back when the saved layout loads with no panels", () => {
    const d = fakeDock({ fromJSON: () => [] });
    expect(restoreLayout(d.api, saved(["source"]), presetById("watch"), "youtube")).toBe(false);
    expect(d.panels[0]?.id).toBe("source");
  });

  it("adds the minimum size to panels saved without one", () => {
    const out = withMinimumSizes(saved(["notes"]));
    expect(out.panels.notes).toMatchObject({ id: "notes", minimumWidth: PANEL_MIN_WIDTH });
  });
});

describe("openPanel and revealSource", () => {
  it("reopens a closed source on the left", () => {
    const d = fakeDock();
    d.api.addPanel({ id: "chat", component: "chat" });
    revealSource(d.api, "youtube");
    expect(d.added.at(-1)).toMatchObject({
      id: "source",
      renderer: "always",
      position: { direction: "left" },
    });
  });

  it("reopens a closed source above its open transcript", () => {
    const d = fakeDock();
    d.api.addPanel({ id: "transcript", component: "transcript" });
    revealSource(d.api, "youtube");
    expect(d.added.at(-1)).toMatchObject({
      id: "source",
      position: { referencePanel: "transcript", direction: "above" },
    });
  });

  it("leaves a visible source alone, so focus stays where the reader clicked", () => {
    const d = fakeDock();
    d.api.addPanel({ id: "source", component: "source" });
    const before = d.added.length;
    revealSource(d.api, "youtube");
    expect(d.added).toHaveLength(before);
    expect(d.panels[0]?.active).toBe(false);
  });

  it("brings a hidden source tab forward and leaves a maximised group", () => {
    const d = fakeDock();
    d.api.addPanel({ id: "source", component: "source" });
    const source = d.panels[0];
    if (source) source.visible = false;
    d.maximize();
    revealSource(d.api, "youtube");
    expect(d.isMaximized()).toBe(false);
    expect(source?.active).toBe(true);
  });

  it("stacks a reopened Learn tool with the other Learn tools", () => {
    const d = fakeDock();
    d.api.addPanel({ id: "quiz", component: "quiz" });
    openPanel(d.api, "notes", "youtube");
    expect(d.added.at(-1)).toMatchObject({
      id: "notes",
      position: { referencePanel: "quiz", direction: "within" },
    });
  });

  it("puts a reopened transcript under the source", () => {
    const d = fakeDock();
    d.api.addPanel({ id: "source", component: "source" });
    openPanel(d.api, "transcript", "youtube");
    expect(d.added.at(-1)).toMatchObject({
      position: { referencePanel: "source", direction: "below" },
    });
  });
});
