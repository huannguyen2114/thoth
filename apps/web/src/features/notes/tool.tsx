"use client";

import { PlaceholderPanel } from "@/features/learn-panel/placeholder-panel";
import type { LearnTool } from "@/features/learn-panel/types";

/** STUB from Step 0. Owned by the Phase 4 lane: replace NotesPanel with the real panel. */
function NotesPanel() {
  return <PlaceholderPanel label="Notes" phase="Phase 4" />;
}

export const notesTool: LearnTool = {
  id: "notes",
  label: "Notes",
  description: "Your own notes, with help from Claude.",
  Panel: NotesPanel,
};
