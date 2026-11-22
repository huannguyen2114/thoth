"use client";

import type { ContentKind } from "@thoth/core";
import { cx } from "@thoth/ui";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { panelTitle, type WorkspacePanelId } from "./panel-ids";

/** Under the source, on the left. */
export const LOWER_PANELS = ["chapters", "transcript"] as const satisfies WorkspacePanelId[];
/** The tools on the right, behind pill tabs. */
export const TOOL_PANELS = [
  "chat",
  "summary",
  "notes",
  "quiz",
  "flashcards",
  "whiteboard",
] as const satisfies WorkspacePanelId[];

export type LowerPanel = (typeof LOWER_PANELS)[number];
export type ToolPanel = (typeof TOOL_PANELS)[number];
export interface SplitState {
  lower: LowerPanel;
  tool: ToolPanel;
}

export const isLowerPanel = (id: string): id is LowerPanel =>
  (LOWER_PANELS as readonly string[]).includes(id);
export const isToolPanel = (id: string): id is ToolPanel =>
  (TOOL_PANELS as readonly string[]).includes(id);

/** What each layout preset shows in the split (same names as the dock's presets). */
export const SPLIT_PRESETS = {
  study: { lower: "chapters", tool: "chat" },
  watch: { lower: "transcript", tool: "notes" },
  quiz: { lower: "chapters", tool: "quiz" },
} as const satisfies Record<string, SplitState>;

/** Shows a panel in the split: a lower panel or a tool switches its tab; the source is always there. */
export function splitShow(s: SplitState, id: WorkspacePanelId): SplitState {
  if (isLowerPanel(id)) return { ...s, lower: id };
  if (isToolPanel(id)) return { ...s, tool: id };
  return s;
}

/** A saved split state, or the Study preset when it is missing or unknown. */
export function parseSplit(raw: string | null): SplitState {
  try {
    const v = JSON.parse(raw ?? "") as Partial<SplitState>;
    return {
      lower: typeof v.lower === "string" && isLowerPanel(v.lower) ? v.lower : "chapters",
      tool: typeof v.tool === "string" && isToolPanel(v.tool) ? v.tool : "chat",
    };
  } catch {
    return { ...SPLIT_PRESETS.study };
  }
}

/**
 * The Modern look's content page (ADR-0050): the source on the left with its chapters or
 * transcript under it, and the tools on the right behind pill tabs, like a chat app. No
 * dragging or docking; the presets pick the tabs. A panel stays mounted once opened, so a quiz
 * in progress or a chat thread survives a tab switch, and the source never reloads.
 */
export function SplitWorkspace({
  kind,
  state,
  onChange,
  renderPanel,
}: {
  kind: ContentKind;
  state: SplitState;
  onChange: (s: SplitState) => void;
  renderPanel: (id: WorkspacePanelId) => ReactNode;
}) {
  const [seen, setSeen] = useState<Set<WorkspacePanelId>>(
    () => new Set<WorkspacePanelId>([state.lower, state.tool]),
  );
  if (!seen.has(state.lower) || !seen.has(state.tool))
    setSeen(new Set(seen).add(state.lower).add(state.tool));

  return (
    <div className="ws-split">
      <section className="ws-split__source" aria-label={panelTitle("source", kind)}>
        <div className="ws-split__viewer">{renderPanel("source")}</div>
        <div className="ws-split__lower">
          <Tabs
            label="Source panels"
            ids={LOWER_PANELS}
            active={state.lower}
            kind={kind}
            variant="line"
            onSelect={(lower) => onChange({ ...state, lower })}
          />
          <Panels ids={LOWER_PANELS} seen={seen} active={state.lower} render={renderPanel} />
        </div>
      </section>
      <section className="ws-split__tools" aria-label="Tools">
        <div className="ws-split__tabbar">
          <Tabs
            label="Tools"
            ids={TOOL_PANELS}
            active={state.tool}
            kind={kind}
            variant="pill"
            onSelect={(tool) => onChange({ ...state, tool })}
          />
        </div>
        <Panels ids={TOOL_PANELS} seen={seen} active={state.tool} render={renderPanel} />
      </section>
    </div>
  );
}

function Tabs<T extends WorkspacePanelId>({
  label,
  ids,
  active,
  kind,
  variant,
  onSelect,
}: {
  label: string;
  ids: readonly T[];
  active: T;
  kind: ContentKind;
  variant: "pill" | "line";
  onSelect: (id: T) => void;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  function onKeyDown(e: KeyboardEvent) {
    const i = ids.indexOf(active);
    const n = ids.length;
    const next =
      e.key === "ArrowRight"
        ? ids[(i + 1) % n]
        : e.key === "ArrowLeft"
          ? ids[(i - 1 + n) % n]
          : e.key === "Home"
            ? ids[0]
            : e.key === "End"
              ? ids[n - 1]
              : undefined;
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    refs.current.get(next)?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx("ws-split__tabs", `ws-split__tabs--${variant}`)}
    >
      {ids.map((id) => (
        <button
          key={id}
          ref={(el) => {
            if (el) refs.current.set(id, el);
            else refs.current.delete(id);
          }}
          type="button"
          role="tab"
          id={`ws-split-tab-${id}`}
          aria-controls={`ws-split-panel-${id}`}
          aria-selected={id === active}
          tabIndex={id === active ? 0 : -1}
          onClick={() => onSelect(id)}
          className="ws-split__tab"
        >
          {panelTitle(id, kind)}
        </button>
      ))}
    </div>
  );
}

function Panels({
  ids,
  seen,
  active,
  render,
}: {
  ids: readonly WorkspacePanelId[];
  seen: Set<WorkspacePanelId>;
  active: WorkspacePanelId;
  render: (id: WorkspacePanelId) => ReactNode;
}) {
  return (
    <div className="ws-split__panels">
      {ids
        .filter((id) => seen.has(id))
        .map((id) => (
          <div
            key={id}
            role="tabpanel"
            id={`ws-split-panel-${id}`}
            aria-labelledby={`ws-split-tab-${id}`}
            hidden={id !== active}
            className="ws-split__panel"
          >
            {render(id)}
          </div>
        ))}
    </div>
  );
}
