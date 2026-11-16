"use client";

import type { ContentKind } from "@thoth/core";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { panelTitle, type WorkspacePanelId } from "./panel-ids";
import { workspacePanels } from "./panels";

/**
 * Phones (ADR-0021): one panel at a time, chosen from a bottom tab bar, because dragging and
 * splitting make no sense on a small touch screen. A panel stays mounted once opened, so it
 * keeps its state (a quiz in progress, a chat thread) when you switch away and back.
 * The source is mounted from the start so citation jumps always have a viewer.
 */
export function PhoneWorkspace({
  kind,
  active,
  onSelect,
  renderPanel,
}: {
  kind: ContentKind;
  active: WorkspacePanelId;
  onSelect: (id: WorkspacePanelId) => void;
  renderPanel: (id: WorkspacePanelId) => ReactNode;
}) {
  const [visited, setVisited] = useState<Set<WorkspacePanelId>>(() => new Set(["source", active]));
  if (!visited.has(active)) setVisited(new Set(visited).add(active));
  const tabs = useRef(new Map<WorkspacePanelId, HTMLButtonElement>());

  function onKeyDown(e: KeyboardEvent) {
    const i = workspacePanels.findIndex((p) => p.id === active);
    const n = workspacePanels.length;
    const next =
      e.key === "ArrowRight"
        ? workspacePanels[(i + 1) % n]
        : e.key === "ArrowLeft"
          ? workspacePanels[(i - 1 + n) % n]
          : e.key === "Home"
            ? workspacePanels[0]
            : e.key === "End"
              ? workspacePanels.at(-1)
              : undefined;
    if (!next) return;
    e.preventDefault();
    onSelect(next.id);
    tabs.current.get(next.id)?.focus();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        {workspacePanels
          .filter((p) => visited.has(p.id))
          .map((p) => (
            <div
              key={p.id}
              role="tabpanel"
              id={`ws-phone-panel-${p.id}`}
              aria-labelledby={`ws-phone-tab-${p.id}`}
              hidden={p.id !== active}
              className="absolute inset-0 bg-surface-100"
            >
              {renderPanel(p.id)}
            </div>
          ))}
      </div>
      <div role="tablist" aria-label="Panels" className="ws-phone-tabs" onKeyDown={onKeyDown}>
        {workspacePanels.map((p) => (
          <button
            key={p.id}
            ref={(el) => {
              if (el) tabs.current.set(p.id, el);
              else tabs.current.delete(p.id);
            }}
            type="button"
            role="tab"
            id={`ws-phone-tab-${p.id}`}
            aria-controls={visited.has(p.id) ? `ws-phone-panel-${p.id}` : undefined}
            aria-selected={p.id === active}
            tabIndex={p.id === active ? 0 : -1}
            className="ws-phone-tab"
            onClick={() => onSelect(p.id)}
          >
            <p.Icon />
            {panelTitle(p.id, kind)}
          </button>
        ))}
      </div>
    </div>
  );
}
