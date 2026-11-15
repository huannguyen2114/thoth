"use client";

import { PlaceholderPanel } from "@/features/learn-panel/placeholder-panel";
import type { LearnTool } from "@/features/learn-panel/types";

/** STUB from Step 0. Owned by the Phase 4 lane: replace SummaryPanel with the real panel. */
function SummaryPanel() {
  return <PlaceholderPanel label="Summary" phase="Phase 4" />;
}

export const summaryTool: LearnTool = {
  id: "summary",
  label: "Summary",
  description: "Detailed notes, a cheat sheet or a short overview.",
  Panel: SummaryPanel,
};
