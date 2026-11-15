"use client";

import { PlaceholderPanel } from "@/features/learn-panel/placeholder-panel";
import type { LearnTool } from "@/features/learn-panel/types";

/** STUB from Step 0. Owned by the Phase 5 lane: replace QuizPanel with the real panel. */
function QuizPanel() {
  return <PlaceholderPanel label="Quiz" phase="Phase 5" />;
}

export const quizTool: LearnTool = {
  id: "quiz",
  label: "Quiz",
  description: "Questions by topic, with explanations.",
  Panel: QuizPanel,
};
