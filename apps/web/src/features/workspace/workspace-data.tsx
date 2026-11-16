"use client";

import type { Chapter, Segment } from "@thoth/core";
import { createContext, type ReactNode, useContext } from "react";
import type { ChatController } from "@/features/chat/use-chat";

/**
 * Data the panels share beyond `WorkspacePanelProps`: the source's segments and chapters, and
 * the chat. The chat lives here, not in the Chat panel, so closing the panel and opening it
 * again keeps the thread, and an answer that is streaming keeps streaming.
 */
export interface WorkspaceData {
  segments: Segment[];
  chapters: Chapter[];
  chat: ChatController;
}

const Ctx = createContext<WorkspaceData | null>(null);

export function WorkspaceDataProvider({
  value,
  children,
}: {
  value: WorkspaceData;
  children: ReactNode;
}) {
  return <Ctx value={value}>{children}</Ctx>;
}

export function useWorkspaceData(): WorkspaceData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspaceData must be used inside <WorkspaceDataProvider>.");
  return v;
}
