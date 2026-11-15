import type { QuizAttemptId, QuizQuestionId, StudySetId } from "../shared/id";
import type { Locator } from "./content";

export const quizQuestionTypes = [
  "multiple_choice",
  "multi_select",
  "free_response",
  "true_false",
  "fill_blank",
] as const;
export type QuizQuestionType = (typeof quizQuestionTypes)[number];

export const quizDifficulties = ["easy", "medium", "hard"] as const;
export type QuizDifficulty = (typeof quizDifficulties)[number];

/**
 * Answer shapes by type:
 * - multiple_choice: { index }        - multi_select: { indices }
 * - true_false: { value }             - fill_blank: { accepted: string[] }
 * - free_response: { rubric }         (graded by the LLM, task "grading")
 */
export type QuizAnswer =
  | { type: "multiple_choice"; index: number }
  | { type: "multi_select"; indices: number[] }
  | { type: "true_false"; value: boolean }
  | { type: "fill_blank"; accepted: string[] }
  | { type: "free_response"; rubric: string };

export interface QuizQuestion {
  id: QuizQuestionId;
  setId: StudySetId;
  idx: number;
  type: QuizQuestionType;
  difficulty: QuizDifficulty;
  prompt: string;
  /** Choices for multiple_choice / multi_select; null otherwise. */
  choices: string[] | null;
  answer: QuizAnswer;
  explanation: string;
  /** Chapter title the question belongs to (quiz sets are per topic). */
  topic: string;
  locator: Locator | null;
}
export type NewQuizQuestion = Omit<QuizQuestion, "id" | "setId">;

export interface QuizAttempt {
  id: QuizAttemptId;
  questionId: QuizQuestionId;
  /** What the learner submitted. Same discriminants as QuizAnswer, without the rubric. */
  response: unknown;
  correct: boolean;
  /** 0..1, partial credit for multi_select and free_response. */
  score: number;
  feedback: string | null;
  createdAt: Date;
}
export type NewQuizAttempt = Omit<QuizAttempt, "id" | "createdAt">;
