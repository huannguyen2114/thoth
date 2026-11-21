"use client";

import { cx } from "@thoth/ui";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Command, useCommands } from "@/app/_components/commands";
import { SpaceDashboardView } from "./space-dashboard";

import { type SpaceTab, spaceTabs } from "./space-tabs";

/** Tabs that fill the height (their own scroll inside); the rest scroll as a page. */
const FULL: ReadonlySet<SpaceTab> = new Set(["chat", "notes", "board"]);

/**
 * The space workspace (doc 22): a fixed header and Hearth tabs over one panel at a time.
 * The chosen tab is in the URL (`?tab=`), so a reload, a link from History or search, and the
 * back button land on it. A panel mounts on first visit and then stays mounted while hidden,
 * so a streaming chat answer or unsaved board edit survives a tab switch.
 */
export function SpaceWorkspace({
  spaceId,
  initialTab,
  header,
  panels,
}: {
  spaceId: string;
  initialTab: SpaceTab;
  header: ReactNode;
  panels: Record<Exclude<SpaceTab, "overview">, ReactNode>;
}) {
  const [tab, setTab] = useState<SpaceTab>(initialTab);
  const [seen, setSeen] = useState<Set<SpaceTab>>(() => new Set([initialTab]));
  const baseId = useId();
  const refs = useRef<Partial<Record<SpaceTab, HTMLButtonElement | null>>>({});

  const choose = useCallback((next: SpaceTab, focus = false) => {
    setTab(next);
    setSeen((s) => (s.has(next) ? s : new Set(s).add(next)));
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
    if (focus) refs.current[next]?.focus();
  }, []);

  const commands = useMemo<Command[]>(
    () =>
      spaceTabs.map((t) => ({
        id: `space-tab-${t.id}`,
        group: "Space",
        label: `Space: ${t.label}`,
        keywords: ["tab", "space"],
        run: () => choose(t.id),
      })),
    [choose],
  );
  useCommands("Space tabs", commands);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = spaceTabs.findIndex((t) => t.id === tab);
    const n = spaceTabs.length;
    const next = spaceTabs[(i + (e.key === "ArrowRight" ? 1 : n - 1)) % n];
    if (!next) return;
    e.preventDefault();
    choose(next.id, true);
  }

  const content: Record<SpaceTab, ReactNode> = {
    overview: <SpaceDashboardView spaceId={spaceId} onOpenTab={(t) => choose(t)} />,
    ...panels,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-6 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {header}
          <div
            role="tablist"
            aria-label="Space"
            className="tabs -mx-1 overflow-x-auto px-1 whitespace-nowrap"
            onKeyDown={onKey}
          >
            {spaceTabs.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.id}`}
                aria-controls={`${baseId}-panel-${t.id}`}
                aria-selected={tab === t.id}
                tabIndex={tab === t.id ? 0 : -1}
                className="tab"
                onClick={() => choose(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {spaceTabs.map((t) =>
        seen.has(t.id) ? (
          <div
            key={t.id}
            role="tabpanel"
            id={`${baseId}-panel-${t.id}`}
            aria-labelledby={`${baseId}-tab-${t.id}`}
            hidden={tab !== t.id}
            className={cx(
              "min-h-0 flex-1",
              FULL.has(t.id)
                ? "overflow-hidden px-4 py-4 md:px-8"
                : "overflow-y-auto px-4 py-6 md:px-8",
            )}
          >
            <div className={cx("mx-auto max-w-5xl", FULL.has(t.id) && "h-full")}>
              {content[t.id]}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}
