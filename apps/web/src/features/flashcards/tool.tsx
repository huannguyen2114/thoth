"use client";

import { PlaceholderPanel } from "@/features/learn-panel/placeholder-panel";
import type { LearnTool } from "@/features/learn-panel/types";

/** STUB from Step 0. Owned by the Phase 6 lane: replace FlashcardsPanel with the real panel. */
function FlashcardsPanel() {
  return <PlaceholderPanel label="Flashcards" phase="Phase 6" />;
}

export const flashcardsTool: LearnTool = {
  id: "flashcards",
  label: "Flashcards",
  description: "Cards you review with spaced repetition.",
  Panel: FlashcardsPanel,
};
