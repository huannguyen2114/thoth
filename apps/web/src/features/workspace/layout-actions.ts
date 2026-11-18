import type { ContentKind } from "@thoth/core";
import type {
  AddPanelOptions,
  AddPanelPositionOptions,
  DockviewApi,
  SerializedDockview,
} from "dockview";
import type { Preset, PresetStep } from "./layout";
import { panelTitle, WORKSPACE_PANEL_IDS, type WorkspacePanelId } from "./panel-ids";

/**
 * Operations on a live dock. They take only the parts of `DockviewApi` they use, so the
 * tests drive them with a small fake.
 */
export type DockApi = Pick<
  DockviewApi,
  | "addPanel"
  | "getPanel"
  | "clear"
  | "fromJSON"
  | "panels"
  | "width"
  | "height"
  | "hasMaximizedGroup"
  | "exitMaximizedGroup"
>;

/** Where a panel is added, and its starting size. */
interface Placement {
  position?: AddPanelPositionOptions;
  initialWidth?: number;
  initialHeight?: number;
}

/**
 * The smallest a panel may be squeezed to by a split or a drag. Below this the chat header
 * and the Learn tools stop being usable; dockview keeps every panel at least this size.
 */
export const PANEL_MIN_WIDTH = 240;
export const PANEL_MIN_HEIGHT = 140;

/** Panels that need to stay in the page while hidden (the YouTube iframe would reload). */
const ALWAYS_RENDERED = new Set<WorkspacePanelId>(["source"]);

function panelOptions(
  id: WorkspacePanelId,
  kind: ContentKind,
): Pick<
  AddPanelOptions,
  "id" | "component" | "title" | "renderer" | "minimumWidth" | "minimumHeight"
> {
  return {
    id,
    component: id,
    title: panelTitle(id, kind),
    minimumWidth: PANEL_MIN_WIDTH,
    minimumHeight: PANEL_MIN_HEIGHT,
    ...(ALWAYS_RENDERED.has(id) ? { renderer: "always" as const } : {}),
  };
}

function sizeFor(api: DockApi, step: PresetStep): Placement {
  if (!step.size || !step.at) return {};
  const d = step.at.direction;
  if (d === "left" || d === "right") return { initialWidth: Math.round(api.width * step.size) };
  if (d === "above" || d === "below") return { initialHeight: Math.round(api.height * step.size) };
  return {};
}

/** Clears the dock and builds a preset. The first panel ends up active. */
export function applyPreset(api: DockApi, preset: Preset, kind: ContentKind) {
  api.clear();
  for (const step of preset.steps) {
    api.addPanel({
      ...panelOptions(step.id, kind),
      ...(step.at
        ? { position: { referencePanel: step.at.ref, direction: step.at.direction } }
        : {}),
      ...sizeFor(api, step),
      ...(step.inactive ? { inactive: true } : {}),
    });
  }
  const first = preset.steps[0];
  if (first) api.getPanel(first.id)?.api.setActive();
}

/**
 * Restores a saved layout. If dockview rejects it (a layout from an older dockview, or one
 * edited by hand), the dock is cleared and the fallback preset is built instead.
 * Returns whether the saved layout was used.
 */
export function restoreLayout(
  api: DockApi,
  saved: SerializedDockview | null,
  fallback: Preset,
  kind: ContentKind,
): boolean {
  if (saved) {
    try {
      api.fromJSON(withMinimumSizes(saved));
      if (api.panels.length > 0) {
        retitle(api, kind);
        return true;
      }
    } catch (cause) {
      console.warn("Saved workspace layout did not load; using the default.", cause);
    }
  }
  applyPreset(api, fallback, kind);
  return false;
}

/** Gives every saved panel the current minimum size, including layouts saved before it. */
export function withMinimumSizes(dock: SerializedDockview): SerializedDockview {
  const panels = Object.fromEntries(
    Object.entries(dock.panels).map(([id, state]) => [
      id,
      { ...state, minimumWidth: PANEL_MIN_WIDTH, minimumHeight: PANEL_MIN_HEIGHT },
    ]),
  );
  return { ...dock, panels };
}

/** Titles depend on the content kind ("Transcript" or "Text"); the saved layout is shared. */
export function retitle(api: DockApi, kind: ContentKind) {
  for (const p of api.panels) {
    const id = p.id as WorkspacePanelId;
    if (WORKSPACE_PANEL_IDS.includes(id)) p.api.setTitle(panelTitle(id, kind));
  }
}

/** Where a closed panel comes back: next to the panels it belongs with. */
function reopenPosition(api: DockApi, id: WorkspacePanelId): Placement {
  const open = (x: WorkspacePanelId) => Boolean(api.getPanel(x));
  const learn: WorkspacePanelId[] = ["notes", "quiz", "summary", "flashcards", "whiteboard"];
  const outline: WorkspacePanelId[] = ["chapters", "transcript"];
  const ref = (ids: WorkspacePanelId[]) => ids.find((x) => x !== id && open(x));

  if (id === "source") {
    // Back above its chapters or transcript if they are open, otherwise as a column on the left.
    const below = ref(outline);
    if (below) {
      return {
        position: { referencePanel: below, direction: "above" },
        initialHeight: Math.round(api.height * 0.6),
      };
    }
    return { position: { direction: "left" }, initialWidth: Math.round(api.width * 0.4) };
  }
  if (outline.includes(id)) {
    const sibling = ref(outline);
    if (sibling) return { position: { referencePanel: sibling, direction: "within" } };
    if (open("source")) return { position: { referencePanel: "source", direction: "below" } };
  }
  if (learn.includes(id)) {
    const sibling = ref(learn);
    if (sibling) return { position: { referencePanel: sibling, direction: "within" } };
  }
  return { position: { direction: "right" }, initialWidth: Math.round(api.width * 0.35) };
}

/** Shows a panel: focuses it if open, otherwise adds it back where it belongs. */
export function openPanel(api: DockApi, id: WorkspacePanelId, kind: ContentKind) {
  const existing = api.getPanel(id);
  if (existing) {
    if (api.hasMaximizedGroup() && !existing.api.isVisible) api.exitMaximizedGroup();
    existing.api.setActive();
    return;
  }
  api.addPanel({ ...panelOptions(id, kind), ...reopenPosition(api, id) });
}

/**
 * Makes the Source panel visible for a citation jump without moving focus away from the
 * panel the reader clicked in, unless the source has to be reopened or brought forward.
 */
export function revealSource(api: DockApi, kind: ContentKind) {
  const source = api.getPanel("source");
  if (source?.api.isVisible) return;
  openPanel(api, "source", kind);
}
