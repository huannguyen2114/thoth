"use client";

import type { ContentId } from "@thoth/core";
import { cx } from "@thoth/ui";
import { type KeyboardEvent, useRef, useState } from "react";
import { ChatComposer } from "@/features/chat/chat-composer";
import { ChatView } from "@/features/chat/chat-view";
import { type ChatSummary, useChat } from "@/features/chat/use-chat";
import { useViewer } from "@/features/content-viewer/viewer-context";
import { GenerateGrid } from "./generate-grid";
import { learnTools } from "./registry";
import type { LearnToolId } from "./types";

type PanelTab =
  | { key: string; kind: "learn" }
  | { key: string; kind: "tool"; toolId: LearnToolId }
  | { key: "chat"; kind: "chat" };

const toolById = new Map(learnTools.map((t) => [t.id, t]));

function tabLabel(tab: PanelTab, chatTitle: string | undefined): string {
  if (tab.kind === "learn") return "Learn";
  if (tab.kind === "chat") return chatTitle ? "Chat" : "New chat";
  return toolById.get(tab.toolId)?.label ?? tab.toolId;
}

/**
 * The Learn panel: browser-like closable tabs. A Learn tab shows the Generate grid built from
 * `learnTools`; each tool opens in its own tab. The chat composer stays at the bottom and
 * sends into the Chat tab. Every tool gets `contentId` and `onCite`, which jumps the viewer.
 */
export function LearnPanel({
  contentId,
  initialChats,
}: {
  contentId: ContentId;
  initialChats: ChatSummary[];
}) {
  const chat = useChat(contentId, initialChats);
  const { jumpToToken } = useViewer();
  const nextKey = useRef(1);
  const [tabs, setTabs] = useState<PanelTab[]>([{ key: "learn-0", kind: "learn" }]);
  const [active, setActive] = useState<string>("learn-0");
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  function open(tab: PanelTab) {
    setTabs((list) => (list.some((t) => t.key === tab.key) ? list : [...list, tab]));
    setActive(tab.key);
  }
  const openTool = (toolId: LearnToolId) => open({ key: `tool-${toolId}`, kind: "tool", toolId });
  const openChat = () => open({ key: "chat", kind: "chat" });
  const newLearnTab = () => open({ key: `learn-${nextKey.current++}`, kind: "learn" });

  function close(key: string) {
    const i = tabs.findIndex((t) => t.key === key);
    const rest = tabs.filter((t) => t.key !== key);
    setTabs(rest);
    if (key === active) setActive(rest[Math.min(i, rest.length - 1)]?.key ?? "");
  }

  function onTabKeys(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.key === active);
    let next: PanelTab | undefined;
    if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
    else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === "Delete" && tabs[i]) {
      e.preventDefault();
      close(tabs[i].key);
      return;
    }
    if (!next) return;
    e.preventDefault();
    setActive(next.key);
    tabRefs.current.get(next.key)?.focus();
  }

  return (
    <section aria-label="Learn" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-end gap-1 border-b border-border-subtle px-3">
        <div
          role="tablist"
          aria-label="Learn tabs"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
          onKeyDown={onTabKeys}
        >
          {tabs.map((t) => {
            const selected = t.key === active;
            const label = tabLabel(t, chat.chat?.title);
            return (
              <div
                key={t.key}
                className={cx(
                  "-mb-px flex shrink-0 items-center gap-1 border-b-2 pr-1",
                  selected ? "border-accent" : "border-transparent",
                )}
              >
                <button
                  ref={(el) => {
                    if (el) tabRefs.current.set(t.key, el);
                    else tabRefs.current.delete(t.key);
                  }}
                  type="button"
                  role="tab"
                  id={`learn-tab-${t.key}`}
                  aria-controls={`learn-panel-${t.key}`}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(t.key)}
                  className={cx(
                    "type-label py-3 pl-2 hover:text-ink",
                    selected ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {label}
                </button>
                <button
                  type="button"
                  onClick={() => close(t.key)}
                  aria-label={`Close ${label} tab`}
                  tabIndex={-1}
                  className="grid size-6 place-items-center rounded-sm text-ink-muted hover:bg-surface-300 hover:text-ink"
                >
                  <CloseIcon />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={newLearnTab}
          aria-label="New Learn tab"
          title="New Learn tab"
          className="mb-1 grid size-8 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
        >
          <PlusIcon />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {tabs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="type-body text-ink-muted">
              All tabs are closed. Open a Learn tab to pick a tool.
            </p>
            <button type="button" className="btn btn--secondary btn--sm" onClick={newLearnTab}>
              Open Learn tab
            </button>
          </div>
        )}
        {/* Panels stay mounted while hidden so a tool keeps its state when you switch tabs. */}
        {tabs.map((t) => (
          <div
            key={t.key}
            role="tabpanel"
            id={`learn-panel-${t.key}`}
            aria-labelledby={`learn-tab-${t.key}`}
            hidden={t.key !== active}
            className="absolute inset-0 overflow-y-auto"
          >
            {t.kind === "learn" && (
              <GenerateGrid
                onOpenTool={openTool}
                chats={chat.chats}
                onOpenChat={async (id) => {
                  openChat();
                  await chat.openChat(id);
                }}
              />
            )}
            {t.kind === "chat" && <ChatView chat={chat} />}
            {t.kind === "tool" && (
              <ToolPanel toolId={t.toolId} contentId={contentId} onCite={jumpToToken} />
            )}
          </div>
        ))}
      </div>

      <div className="shrink-0 p-3">
        <ChatComposer chat={chat} onBeforeSend={openChat} />
      </div>
    </section>
  );
}

function ToolPanel({
  toolId,
  contentId,
  onCite,
}: {
  toolId: LearnToolId;
  contentId: ContentId;
  onCite: (token: string) => void;
}) {
  const tool = toolById.get(toolId);
  if (!tool) return null;
  return (
    <div className="p-4">
      <tool.Panel contentId={contentId} onCite={onCite} />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
