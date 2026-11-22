"use client";

import type { Chapter, Content, Segment } from "@thoth/core";
import { Button } from "@thoth/ui";
import type { DockviewApi, DockviewGroupPanel } from "dockview";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type Command, useCommands } from "@/app/_components/commands";
import { useSkin } from "@/app/_components/use-skin";
import { type ChatSummary, useChat } from "@/features/chat/use-chat";
import { InitialJump } from "@/features/content-viewer/initial-jump";
import { useViewer, ViewerProvider } from "@/features/content-viewer/viewer-context";
import { Dock } from "./dock";
import { LayoutIcon, MaximizeIcon, PlusIcon, ResetIcon, RestoreIcon } from "./icons";
import {
  clearLayout,
  DEFAULT_PRESET,
  loadLayout,
  PRESETS,
  type PresetId,
  presetById,
  saveLayout,
} from "./layout";
import { applyPreset, openPanel, restoreLayout, revealSource } from "./layout-actions";
import { MenuButton, type MenuEntry } from "./menu-button";
import { isWorkspacePanelId, panelTitle, type WorkspacePanelId } from "./panel-ids";
import { workspacePanel, workspacePanels } from "./panels";
import { PhoneWorkspace } from "./phone-workspace";
import {
  parseSplit,
  SPLIT_PRESETS,
  type SplitState,
  SplitWorkspace,
  splitShow,
} from "./split-workspace";
import { WorkspaceDataProvider } from "./workspace-data";

const PHONE_QUERY = "(max-width: 767px)";
const PHONE_TAB_KEY = "thoth.workspace.phoneTab";
const SPLIT_KEY = "thoth.workspace.split";
const SAVE_DELAY_MS = 300;

type Mode = "pending" | "dock" | "phone" | "split";

function subscribeMode(onChange: () => void) {
  const m = window.matchMedia(PHONE_QUERY);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

/** "pending" on the server and during hydration, then the real mode. */
function useMode(): Mode {
  return useSyncExternalStore<Mode>(
    subscribeMode,
    () => (window.matchMedia(PHONE_QUERY).matches ? "phone" : "dock"),
    () => "pending",
  );
}

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * The content page body (ADR-0021): a dock of panels on desktop, one panel at a time on
 * phones. Every panel can be dragged, split, stacked, resized, maximised and closed; the
 * layout is saved per viewer. A citation from any panel jumps the Source panel, reopening it
 * if it was closed. See docs/technical_design/07-content-page-and-chat.md.
 */
export function ContentWorkspace({
  content,
  segments,
  chapters,
  chats,
  initialCite,
}: {
  content: Content;
  segments: Segment[];
  chapters: Chapter[];
  chats: ChatSummary[];
  /** Citation token to jump to on load, from `?at=`. */
  initialCite?: string | undefined;
}) {
  const screen = useMode();
  const skin = useSkin();
  // The Modern look uses a fixed split instead of the dock (ADR-0050); phones stay as they are.
  const mode: Mode =
    screen === "pending" || skin === "pending"
      ? "pending"
      : screen === "dock" && skin === "modern"
        ? "split"
        : screen;
  const chat = useChat(content.id, chats);
  const api = useRef<DockviewApi | null>(null);
  const [phoneTab, setPhoneTab] = useState<WorkspacePanelId>("source");

  // Every jump reveals the source first: in the dock, focus or reopen the Source panel;
  // on a phone, switch to its tab.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const reveal = useCallback(() => {
    if (modeRef.current === "phone") setPhoneTab("source");
    else if (api.current) revealSource(api.current, content.kind);
  }, [content.kind]);

  const data = useMemo(() => ({ segments, chapters, chat }), [segments, chapters, chat]);

  return (
    <ViewerProvider onJump={reveal}>
      <InitialJump token={initialCite} />
      <WorkspaceDataProvider value={data}>
        <WorkspaceBody
          content={content}
          mode={mode}
          api={api}
          phoneTab={phoneTab}
          setPhoneTab={setPhoneTab}
        />
      </WorkspaceDataProvider>
    </ViewerProvider>
  );
}

function WorkspaceBody({
  content,
  mode,
  api,
  phoneTab,
  setPhoneTab,
}: {
  content: Content;
  mode: Mode;
  api: RefObject<DockviewApi | null>;
  phoneTab: WorkspacePanelId;
  setPhoneTab: (id: WorkspacePanelId) => void;
}) {
  const { jumpToToken } = useViewer();
  const kind = content.kind;
  const [openIds, setOpenIds] = useState<ReadonlySet<WorkspacePanelId>>(new Set());

  // ---------- Phone tab, remembered per viewer ----------
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PHONE_TAB_KEY);
      if (isWorkspacePanelId(saved)) setPhoneTab(saved);
    } catch {}
  }, [setPhoneTab]);
  const selectPhoneTab = useCallback(
    (id: WorkspacePanelId) => {
      setPhoneTab(id);
      try {
        localStorage.setItem(PHONE_TAB_KEY, id);
      } catch {}
    },
    [setPhoneTab],
  );

  // ---------- Split (the Modern look), remembered per viewer ----------
  const [split, setSplitState] = useState<SplitState>(SPLIT_PRESETS.study);
  useEffect(() => {
    try {
      setSplitState(parseSplit(localStorage.getItem(SPLIT_KEY)));
    } catch {}
  }, []);
  const setSplit = useCallback((s: SplitState) => {
    setSplitState(s);
    try {
      localStorage.setItem(SPLIT_KEY, JSON.stringify(s));
    } catch {}
  }, []);

  // ---------- Dock ----------
  const onReady = useCallback(
    (dock: DockviewApi) => {
      api.current = dock;
      restoreLayout(dock, loadLayout(storage()), presetById(DEFAULT_PRESET), kind);
      const sync = () =>
        setOpenIds(new Set(dock.panels.map((p) => p.id).filter(isWorkspacePanelId)));
      sync();
      let timer: number | undefined;
      const sub = dock.onDidLayoutChange(() => {
        sync();
        window.clearTimeout(timer);
        timer = window.setTimeout(() => saveLayout(storage(), dock.toJSON()), SAVE_DELAY_MS);
      });
      return () => {
        window.clearTimeout(timer);
        sub.dispose();
        if (api.current === dock) api.current = null;
      };
    },
    [api, kind],
  );

  const applyPresetById = useCallback(
    (id: PresetId) => {
      if (mode === "split") setSplit({ ...SPLIT_PRESETS[id] });
      else if (api.current) applyPreset(api.current, presetById(id), kind);
    },
    [api, kind, mode, setSplit],
  );
  const resetLayout = useCallback(() => {
    clearLayout(storage());
    applyPresetById(DEFAULT_PRESET);
  }, [applyPresetById]);
  const showPanel = useCallback(
    (id: WorkspacePanelId) => {
      if (mode === "phone") selectPhoneTab(id);
      else if (mode === "split") setSplit(splitShow(split, id));
      else if (api.current) openPanel(api.current, id, kind);
    },
    [mode, api, kind, selectPhoneTab, split, setSplit],
  );

  // ---------- Palette commands (ADR-0020) ----------
  const commands = useMemo<Command[]>(() => {
    const panels: Command[] = workspacePanels.map((p) => ({
      id: `workspace.show.${p.id}`,
      label: `Workspace: Show ${panelTitle(p.id, kind)}`,
      group: "Workspace",
      keywords: ["panel", "open", p.id],
      run: () => showPanel(p.id),
    }));
    if (mode === "phone" || mode === "pending") return panels;
    if (mode === "split")
      return [
        ...PRESETS.map((p) => ({
          id: `workspace.preset.${p.id}`,
          label: `Workspace: ${p.label} layout`,
          group: "Workspace",
          keywords: ["layout", "preset", "arrange"],
          run: () => applyPresetById(p.id),
        })),
        ...panels,
      ];
    return [
      ...PRESETS.map((p) => ({
        id: `workspace.preset.${p.id}`,
        label: `Workspace: ${p.label} layout`,
        group: "Workspace",
        keywords: ["layout", "preset", "arrange"],
        run: () => applyPresetById(p.id),
      })),
      {
        id: "workspace.reset",
        label: "Workspace: Reset layout",
        group: "Workspace",
        keywords: ["layout", "default", "restore"],
        run: resetLayout,
      },
      ...panels,
    ];
  }, [kind, mode, showPanel, applyPresetById, resetLayout]);
  useCommands("Workspace", commands);

  const renderPanel = useCallback(
    (id: WorkspacePanelId) => {
      const p = workspacePanel(id);
      return p ? (
        <p.Component contentId={content.id} content={content} onCite={jumpToToken} />
      ) : null;
    },
    [content, jumpToToken],
  );

  const layoutEntries: MenuEntry[] = [
    ...PRESETS.map(
      (p): MenuEntry => ({
        kind: "item",
        id: p.id,
        label: `${p.label} layout`,
        icon: <LayoutIcon />,
        onSelect: () => applyPresetById(p.id),
      }),
    ),
    { kind: "sep", id: "sep" },
    {
      kind: "item",
      id: "reset",
      label: "Reset layout",
      icon: <ResetIcon />,
      onSelect: resetLayout,
    },
  ];
  const panelEntries: MenuEntry[] = workspacePanels.map((p) => ({
    kind: "item",
    id: p.id,
    label: panelTitle(p.id, kind),
    icon: <p.Icon />,
    ...(openIds.has(p.id) ? { hint: "Open" } : {}),
    onSelect: () => showPanel(p.id),
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-col gap-2 border-b border-border-subtle px-4 py-2">
        <div className="flex min-h-9 items-center gap-2">
          <h1 className="type-heading-3 min-w-0 flex-1 truncate text-ink" title={content.title}>
            {content.title}
          </h1>
          {mode === "split" && (
            <PresetSwitch current={currentPreset(split)} onPick={applyPresetById} />
          )}
          {mode === "dock" && (
            <div className="flex shrink-0 items-center gap-1">
              <MenuButton label="Layout" icon={<LayoutIcon />} entries={layoutEntries} />
              <MenuButton label="Add panel" icon={<PlusIcon />} entries={panelEntries} />
            </div>
          )}
        </div>
        {content.status !== "ready" && <StatusNote content={content} />}
      </header>

      <div className="relative min-h-0 flex-1">
        {mode === "pending" && <DockSkeleton />}
        {mode === "dock" && (
          <Dock
            label="Workspace panels"
            onReady={onReady}
            renderPanel={renderPanel}
            renderGroupActions={(group, dock) => <GroupActions group={group} api={dock} />}
            renderWatermark={() => <EmptyDock onReset={resetLayout} />}
          />
        )}
        {mode === "split" && (
          <SplitWorkspace kind={kind} state={split} onChange={setSplit} renderPanel={renderPanel} />
        )}
        {mode === "phone" && (
          <PhoneWorkspace
            kind={kind}
            active={phoneTab}
            onSelect={selectPhoneTab}
            renderPanel={renderPanel}
          />
        )}
      </div>
    </div>
  );
}

/** Which preset the split matches right now, if any. */
function currentPreset(s: SplitState): PresetId | null {
  for (const p of PRESETS) {
    const v = SPLIT_PRESETS[p.id];
    if (v.lower === s.lower && v.tool === s.tool) return p.id;
  }
  return null;
}

/** The Modern header's layout switch: a segmented control of the presets. */
function PresetSwitch({
  current,
  onPick,
}: {
  current: PresetId | null;
  onPick: (id: PresetId) => void;
}) {
  return (
    <fieldset className="ws-preset-switch">
      <legend className="sr-only">Layout</legend>
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={current === p.id}
          onClick={() => onPick(p.id)}
          className="ws-preset-switch__btn"
        >
          {p.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Right side of each group's tab bar: maximise the group, or restore it. */
function GroupActions({ group, api }: { group: DockviewGroupPanel; api: DockviewApi }) {
  const [maximized, setMaximized] = useState(() => group.api.isMaximized());
  useEffect(() => {
    const sub = api.onDidMaximizedGroupChange(() => setMaximized(group.api.isMaximized()));
    return () => sub.dispose();
  }, [api, group]);
  const label = maximized ? "Restore panel size" : "Maximise panel";
  return (
    <button
      type="button"
      className="ws-icon-btn"
      aria-label={label}
      title={label}
      onClick={() => (maximized ? api.exitMaximizedGroup() : group.api.maximize())}
    >
      {maximized ? <RestoreIcon /> : <MaximizeIcon />}
    </button>
  );
}

function EmptyDock({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="type-heading-3 text-ink">Every panel is closed</h2>
      <p className="type-body max-w-sm text-ink-muted">
        Bring panels back from Add panel, or start again from the Study layout.
      </p>
      <Button variant="primary" onClick={onReset}>
        Reset layout
      </Button>
    </div>
  );
}

function DockSkeleton() {
  return (
    <div className="flex h-full gap-px" role="status" aria-busy="true" aria-label="Loading panels">
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="aspect-video w-full animate-pulse rounded-lg bg-surface-300" />
        <div className="min-h-0 flex-1 animate-pulse rounded-lg bg-surface-300" />
      </div>
      <div className="hidden w-2/5 animate-pulse bg-surface-300 md:block" />
    </div>
  );
}

function StatusNote({ content }: { content: Content }) {
  if (content.status === "failed") {
    return (
      <div className="callout callout--danger max-w-none" role="alert">
        <div>
          <p className="callout__title">This source could not be processed.</p>
          <p className="callout__text">{content.error ?? "Add it again to retry."}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="callout callout--info max-w-none" role="note">
      <div>
        <p className="callout__title">Still processing.</p>
        <p className="callout__text">
          Chat and tools work once the text is ready. Reload in a moment.
        </p>
      </div>
    </div>
  );
}
