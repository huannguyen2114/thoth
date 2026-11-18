import type { Content, ContentId } from "@thoth/core";
import type { ComponentType } from "react";
import { learnTools } from "@/features/learn-panel/registry";
import type { LearnToolId } from "@/features/learn-panel/types";
import {
  ChaptersIcon,
  ChatIcon,
  FlashcardsIcon,
  NotesIcon,
  QuizIcon,
  SourceIcon,
  SummaryIcon,
  TranscriptIcon,
  WhiteboardIcon,
} from "./icons";
import type { WorkspacePanelId } from "./panel-ids";
import {
  ChaptersPanel,
  ChatPanel,
  learnToolPanel,
  SourcePanel,
  TranscriptPanel,
} from "./panel-views";

/** What every workspace panel receives (ADR-0021). */
export interface WorkspacePanelProps {
  contentId: ContentId;
  content: Content;
  /** Jumps the Source panel to a citation token such as "[p.3]" or "[01:46]", reopening it if closed. */
  onCite: (token: string) => void;
}

export interface WorkspacePanel {
  id: WorkspacePanelId;
  Icon: ComponentType;
  Component: ComponentType<WorkspacePanelProps>;
  /**
   * "always" keeps the panel in the page while its tab is hidden or dragged, so the YouTube
   * iframe never reloads. Other panels are detached while hidden (their state stays).
   */
  renderer?: "always";
}

const toolIcon: Record<LearnToolId, ComponentType> = {
  summary: SummaryIcon,
  notes: NotesIcon,
  quiz: QuizIcon,
  flashcards: FlashcardsIcon,
  whiteboard: WhiteboardIcon,
};

/**
 * The panel registry, in Add panel menu order. The Learn tools come from the Learn registry
 * (`features/learn-panel/registry.ts`), so a lane that rebuilds a tool changes it here too.
 */
export const workspacePanels: readonly WorkspacePanel[] = [
  { id: "source", Icon: SourceIcon, Component: SourcePanel, renderer: "always" },
  { id: "chapters", Icon: ChaptersIcon, Component: ChaptersPanel },
  { id: "transcript", Icon: TranscriptIcon, Component: TranscriptPanel },
  { id: "chat", Icon: ChatIcon, Component: ChatPanel },
  ...learnTools.map((tool) => ({
    id: tool.id,
    Icon: toolIcon[tool.id],
    Component: learnToolPanel(tool),
  })),
];

const byId = new Map(workspacePanels.map((p) => [p.id, p]));

export function workspacePanel(id: WorkspacePanelId): WorkspacePanel | undefined {
  return byId.get(id);
}
