import type { ActivityKind } from "@thoth/core";

/**
 * Each kind of study activity has a tone (ADR-0048), matching where it happens in the app:
 * reviews are sky like Review, plans butter like the Planner, quizzes and exams sage like
 * Progress, writing peach, and asking lilac.
 */
const tones: Record<ActivityKind, string> = {
  card_review: "tone-sky",
  quiz_answer: "tone-sage",
  exam_submitted: "tone-sage",
  plan_item_done: "tone-butter",
  content_added: "tone-peach",
  note_edit: "tone-peach",
  whiteboard_edit: "tone-peach",
  summary_generated: "tone-lilac",
  chat_question: "tone-lilac",
};

export function activityTone(kind: ActivityKind): string {
  return tones[kind];
}
