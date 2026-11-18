import { flashcardsTool } from "@/features/flashcards/tool";
import { notesTool } from "@/features/notes/tool";
import { quizTool } from "@/features/quiz/tool";
import { summaryTool } from "@/features/summary/tool";
import { whiteboardTool } from "@/features/whiteboard/tool";
import type { LearnTool } from "./types";

/** Order = order in the Learn panel's Generate grid. Lanes replace their tool.tsx, not this file. */
export const learnTools: readonly LearnTool[] = [
  summaryTool,
  notesTool,
  quizTool,
  flashcardsTool,
  whiteboardTool,
];
