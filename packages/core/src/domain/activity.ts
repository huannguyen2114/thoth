/** Study activity for the habit tracker (ADR-0023). */
export const activityKinds = [
  "quiz_answer",
  "card_review",
  "chat_question",
  "note_edit",
  "content_added",
  "exam_submitted",
  "summary_generated",
] as const;
export type ActivityKind = (typeof activityKinds)[number];

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: Date;
  /** The related id (question, card, message, content, set...). */
  ref: string | null;
}

/** One cell of the heatmap: a local calendar day "YYYY-MM-DD" and how many events it had. */
export interface ActivityDay {
  day: string;
  count: number;
}

/** note_edit is recorded at most once per content per hour (ADR-0023). */
export const NOTE_EDIT_THROTTLE_MS = 60 * 60 * 1000;
