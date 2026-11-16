import type { SerializedDockview } from "dockview";
import { isWorkspacePanelId, type WorkspacePanelId } from "./panel-ids";

/**
 * Workspace layouts (ADR-0021): the presets, and how a layout is saved to and read back from
 * localStorage. Pure functions, so they are unit tested without a browser.
 */

/** One shared layout for every content, per viewer. Bump the version to drop old layouts. */
export const LAYOUT_STORAGE_KEY = "thoth.workspace.layout";
export const LAYOUT_VERSION = 1;

export type PresetId = "study" | "watch" | "quiz";

/** Where a panel goes, relative to a panel added earlier in the same preset. */
export interface PresetStep {
  id: WorkspacePanelId;
  /** Omit for the first panel. `within` stacks it as a tab in the reference panel's group. */
  at?: { ref: WorkspacePanelId; direction: "left" | "right" | "above" | "below" | "within" };
  /** Share of the workspace width (for left/right) or height (above/below), 0 to 1. */
  size?: number;
  /** Added behind the active tab of its group. */
  inactive?: boolean;
}

export interface Preset {
  id: PresetId;
  label: string;
  steps: PresetStep[];
}

export const PRESETS: readonly Preset[] = [
  {
    id: "study",
    label: "Study",
    // Source over Chapters/Transcript on the left; Chat over the Learn tools on the right.
    steps: [
      { id: "source" },
      { id: "chat", at: { ref: "source", direction: "right" }, size: 0.38 },
      { id: "chapters", at: { ref: "source", direction: "below" }, size: 0.35 },
      { id: "transcript", at: { ref: "chapters", direction: "within" }, inactive: true },
      { id: "summary", at: { ref: "chat", direction: "below" }, size: 0.45 },
      { id: "notes", at: { ref: "summary", direction: "within" }, inactive: true },
      { id: "quiz", at: { ref: "summary", direction: "within" }, inactive: true },
      { id: "flashcards", at: { ref: "summary", direction: "within" }, inactive: true },
    ],
  },
  {
    id: "watch",
    label: "Watch + notes",
    // The source with its transcript under it, and Notes beside it at full height.
    steps: [
      { id: "source" },
      { id: "notes", at: { ref: "source", direction: "right" }, size: 0.42 },
      { id: "transcript", at: { ref: "source", direction: "below" }, size: 0.35 },
      { id: "chapters", at: { ref: "transcript", direction: "within" }, inactive: true },
    ],
  },
  {
    id: "quiz",
    label: "Quiz",
    // The source on the left; Notes stacked above the Quiz on the right.
    steps: [
      { id: "source" },
      { id: "quiz", at: { ref: "source", direction: "right" }, size: 0.45 },
      { id: "notes", at: { ref: "quiz", direction: "above" }, size: 0.4 },
    ],
  },
];

export const DEFAULT_PRESET: PresetId = "study";

export function presetById(id: PresetId): Preset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
}

/** The text saved to localStorage. */
export function serializeLayout(dock: SerializedDockview): string {
  return JSON.stringify({ v: LAYOUT_VERSION, dock });
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Reads a saved layout. Returns null, so the caller uses the default preset, when nothing is
 * saved or the text is not a layout this version understands: broken JSON, another version,
 * a missing grid, no panels, or a panel this app does not know (for example one removed
 * since). Floating and popout groups are dropped; the workspace does not use them.
 */
export function parseSavedLayout(raw: string | null | undefined): SerializedDockview | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.v !== LAYOUT_VERSION || !isRecord(data.dock)) return null;
  const { grid, panels, activeGroup } = data.dock;
  if (!isRecord(grid) || !isRecord(grid.root) || !isRecord(panels)) return null;
  const entries = Object.entries(panels);
  if (entries.length === 0) return null;
  for (const [id, state] of entries) {
    if (!isWorkspacePanelId(id) || !isRecord(state)) return null;
    if (state.id !== id || state.contentComponent !== id) return null;
  }
  return {
    grid: grid as SerializedDockview["grid"],
    panels: panels as SerializedDockview["panels"],
    ...(typeof activeGroup === "string" ? { activeGroup } : {}),
  };
}

/** Panel ids in a saved layout, for example to tell which panels the Add panel menu reopens. */
export function layoutPanelIds(dock: SerializedDockview): WorkspacePanelId[] {
  return Object.keys(dock.panels).filter(isWorkspacePanelId);
}

/** Reads the saved layout from storage; storage that throws (private mode) counts as empty. */
export function loadLayout(
  storage: Pick<Storage, "getItem"> | undefined,
): SerializedDockview | null {
  try {
    return parseSavedLayout(storage?.getItem(LAYOUT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Saves the layout. Returns false when storage is full or blocked; the layout still works. */
export function saveLayout(
  storage: Pick<Storage, "setItem"> | undefined,
  dock: SerializedDockview,
): boolean {
  try {
    storage?.setItem(LAYOUT_STORAGE_KEY, serializeLayout(dock));
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function clearLayout(storage: Pick<Storage, "removeItem"> | undefined) {
  try {
    storage?.removeItem(LAYOUT_STORAGE_KEY);
  } catch {}
}
