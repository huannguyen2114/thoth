import type { ContentId } from "@thoth/core";
import type { ComponentType } from "react";

/**
 * Contract between the Learn panel (Lane B) and each learning tool (Lanes C, D).
 * Frozen for parallel work: change only via the orchestrator (docs/plan/parallel-development.md).
 */
export type LearnToolId = "summary" | "notes" | "quiz" | "flashcards" | "whiteboard";

export interface LearnToolProps {
  contentId: ContentId;
  /** Lets a tool ask the Learn panel to jump the viewer to a citation, e.g. "[p.3]" or "[01:46]". */
  onCite?: (token: string) => void;
}

export interface LearnTool {
  id: LearnToolId;
  /** Sentence case, one or two words: "Summary", "Flashcards". */
  label: string;
  /** One line shown under the tool in the Generate grid. */
  description: string;
  /**
   * A CLIENT component ("use client") that renders the whole tool for one content:
   * its generate button and dialog, its list of sets, and the open set.
   * Load data through the feature's own Server Actions.
   */
  Panel: ComponentType<LearnToolProps>;
}
