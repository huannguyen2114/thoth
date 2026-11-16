"use client";

import {
  createDockview,
  type DockviewApi,
  type DockviewGroupPanel,
  type DockviewTheme,
  type IContentRenderer,
  type IHeaderActionsRenderer,
  type IWatermarkRenderer,
} from "dockview";
import "dockview/dist/styles/dockview.css";
import "./workspace.css";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isWorkspacePanelId, type WorkspacePanelId } from "./panel-ids";

/**
 * Hearth theme for dockview: every `--dv-*` colour is mapped to a Hearth token in
 * workspace.css, so no default dockview colour shows in either theme.
 */
const hearthTheme: DockviewTheme = {
  name: "hearth",
  className: "dockview-theme-hearth",
  gap: 0,
  dndPanelOverlay: "group",
  dndTabIndicator: "line",
};

type Slot =
  | { key: string; kind: "panel"; el: HTMLElement; panelId: WorkspacePanelId }
  | { key: string; kind: "actions"; el: HTMLElement; group: DockviewGroupPanel }
  | { key: string; kind: "watermark"; el: HTMLElement };

/**
 * The bridge between dockview (a framework-free library) and React. dockview owns the DOM of
 * the grid, tabs and drag and drop; each panel body, group header action and the empty-state
 * watermark is a plain element that dockview places, and React renders into it with a portal.
 * Portals keep the React tree, so panels read the viewer, workspace and command contexts.
 */
export function Dock({
  onReady,
  renderPanel,
  renderGroupActions,
  renderWatermark,
  label,
}: {
  /**
   * Called once with the API after the dock is created. Lay out panels and subscribe here;
   * the returned function runs before the dock is disposed.
   */
  onReady: (api: DockviewApi) => (() => void) | undefined;
  renderPanel: (id: WorkspacePanelId) => ReactNode;
  renderGroupActions: (group: DockviewGroupPanel, api: DockviewApi) => ReactNode;
  renderWatermark: (api: DockviewApi) => ReactNode;
  label: string;
}) {
  const host = useRef<HTMLElement>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [api, setApi] = useState<DockviewApi | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const add = (slot: Slot) => setSlots((s) => [...s.filter((x) => x.key !== slot.key), slot]);
    const remove = (key: string) => setSlots((s) => s.filter((x) => x.key !== key));
    const element = (className: string) => {
      const div = document.createElement("div");
      div.className = className;
      return div;
    };

    const dock = createDockview(el, {
      theme: hearthTheme,
      disableFloatingGroups: true,
      singleTabMode: "default",
      noPanelsOverlay: "watermark",
      scrollbars: "native",
      createComponent: ({ id, name }): IContentRenderer => {
        const div = element("ws-panel");
        return {
          element: div,
          init: () => {
            if (isWorkspacePanelId(name))
              add({ key: `panel:${id}`, kind: "panel", el: div, panelId: name });
          },
          dispose: () => remove(`panel:${id}`),
        };
      },
      createRightHeaderActionComponent: (group): IHeaderActionsRenderer => {
        const div = element("ws-group-actions");
        const key = `actions:${group.id}`;
        return {
          element: div,
          init: () => add({ key, kind: "actions", el: div, group }),
          dispose: () => remove(key),
        };
      },
      createWatermarkComponent: (): IWatermarkRenderer => {
        const div = element("ws-watermark");
        return {
          element: div,
          init: () => add({ key: "watermark", kind: "watermark", el: div }),
          dispose: () => remove("watermark"),
        };
      },
    });

    // dockview watches the host's size itself (auto-resizing), so the sidebar collapsing or
    // the window resizing re-lays the grid.
    dock.layout(el.clientWidth, el.clientHeight);
    setApi(dock);
    const cleanup = onReadyRef.current(dock);

    return () => {
      cleanup?.();
      setApi(null);
      dock.dispose();
      setSlots([]);
    };
  }, []);

  return (
    <>
      <section ref={host} className="ws-dock" aria-label={label} />
      {api &&
        slots.map((slot) =>
          createPortal(
            slot.kind === "panel"
              ? renderPanel(slot.panelId)
              : slot.kind === "actions"
                ? renderGroupActions(slot.group, api)
                : renderWatermark(api),
            slot.el,
            slot.key,
          ),
        )}
    </>
  );
}
