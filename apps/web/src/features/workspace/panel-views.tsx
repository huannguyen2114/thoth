"use client";

import type { ComponentType } from "react";
import { ChatComposer } from "@/features/chat/chat-composer";
import { ChatView } from "@/features/chat/chat-view";
import { ChaptersView, TranscriptView } from "@/features/content-viewer/outline";
import { SourceViewer } from "@/features/content-viewer/source-viewer";
import type { LearnTool } from "@/features/learn-panel/types";
import { panelTitle } from "./panel-ids";
import type { WorkspacePanelProps } from "./panels";
import { useWorkspaceData } from "./workspace-data";

/**
 * The components behind each workspace panel. Every panel fills its box and scrolls on its
 * own (ADR-0021: panels render at any size).
 */

export function SourcePanel({ content }: WorkspacePanelProps) {
  const { segments } = useWorkspaceData();
  if (content.kind === "youtube") {
    // The video keeps 16:9 and fits the panel whichever side is shorter.
    return (
      <div className="ws-video-stage h-full p-3">
        <SourceViewer content={content} segments={segments} videoClassName="ws-video-fit" />
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto overscroll-contain p-4">
      <SourceViewer content={content} segments={segments} />
    </div>
  );
}

export function ChaptersPanel(_: WorkspacePanelProps) {
  const { chapters } = useWorkspaceData();
  return <ChaptersView chapters={chapters} />;
}

export function TranscriptPanel({ content }: WorkspacePanelProps) {
  const { segments } = useWorkspaceData();
  return <TranscriptView segments={segments} label={panelTitle("transcript", content.kind)} />;
}

export function ChatPanel(_: WorkspacePanelProps) {
  const { chat } = useWorkspaceData();
  return (
    <section aria-label="Chat" className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <ChatView chat={chat} />
      </div>
      <div className="shrink-0 p-3">
        <ChatComposer chat={chat} />
      </div>
    </section>
  );
}

/** A Learn tool (ADR-0016, ADR-0017) shown as a panel through its `LearnToolProps` contract. */
export function learnToolPanel(tool: LearnTool): ComponentType<WorkspacePanelProps> {
  // biome-ignore lint/correctness/noComponentHookFactories: called once per tool when the panel registry module loads, never during render, so the component identity is stable.
  function LearnToolPanel({ contentId, onCite }: WorkspacePanelProps) {
    return (
      <div className="h-full overflow-y-auto overscroll-contain p-4">
        <tool.Panel contentId={contentId} onCite={onCite} />
      </div>
    );
  }
  LearnToolPanel.displayName = `${tool.label}Panel`;
  return LearnToolPanel;
}
