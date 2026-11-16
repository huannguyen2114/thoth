import type { ContentKind } from "@thoth/core";

/**
 * Every panel the content workspace can show (ADR-0021). The id is also the dockview
 * component name and the panel id, so a layout holds at most one of each.
 * Pure data: the layout code and its tests import this without React.
 */
export const WORKSPACE_PANEL_IDS = [
  "source",
  "chapters",
  "transcript",
  "chat",
  "summary",
  "notes",
  "quiz",
  "flashcards",
] as const;

export type WorkspacePanelId = (typeof WORKSPACE_PANEL_IDS)[number];

const known = new Set<string>(WORKSPACE_PANEL_IDS);

export function isWorkspacePanelId(id: unknown): id is WorkspacePanelId {
  return typeof id === "string" && known.has(id);
}

/** The tab title. "Transcript" is called "Text" for sources that are not videos. */
export function panelTitle(id: WorkspacePanelId, kind: ContentKind): string {
  switch (id) {
    case "source":
      return kind === "youtube" ? "Video" : kind === "pdf" ? "PDF" : "Source";
    case "chapters":
      return "Chapters";
    case "transcript":
      return kind === "youtube" ? "Transcript" : "Text";
    case "chat":
      return "Chat";
    case "summary":
      return "Summary";
    case "notes":
      return "Notes";
    case "quiz":
      return "Quiz";
    case "flashcards":
      return "Flashcards";
  }
}
