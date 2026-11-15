import { z } from "zod";
import type { ContentId, ExamSessionId, StudySetId } from "../shared/id";
import { type QuizAnswer, type QuizQuestion, quizDifficulties, quizQuestionTypes } from "./quiz";

/** What the owner chooses in the New exam dialog. Stored as the exam StudySet's options. */
export const examOptionsSchema = z.object({
  contentIds: z.array(z.string().min(1)).min(1, "Pick at least one content for the exam."),
  durationMin: z
    .number()
    .int()
    .min(5, "Give the exam at least 5 minutes.")
    .max(180, "Keep the exam under 3 hours."),
  count: z
    .number()
    .int()
    .min(3, "Ask for at least 3 questions.")
    .max(50, "Ask for 50 questions or fewer."),
  types: z.array(z.enum(quizQuestionTypes)).min(1, "Pick at least one question type."),
  difficulty: z.enum(quizDifficulties),
  language: z.string().trim().min(1).max(40).default("English"),
});
export type ExamOptions = z.infer<typeof examOptionsSchema>;

/** One timed sitting of an exam (ADR-0018). */
export interface ExamSession {
  id: ExamSessionId;
  setId: StudySetId;
  startedAt: Date;
  deadlineAt: Date;
  submittedAt: Date | null;
  /** 0..1 over all questions (unanswered count as 0); null until submitted. */
  score: number | null;
}

/**
 * A question as the browser may see it during an exam: the answer key is replaced by an
 * empty value of the same type, so the input UI works but nothing is revealed (ADR-0018).
 */
export type ExamQuestionView = QuizQuestion;

const emptyAnswer = (a: QuizAnswer): QuizAnswer => {
  switch (a.type) {
    case "multiple_choice":
      return { type: "multiple_choice", index: -1 };
    case "multi_select":
      return { type: "multi_select", indices: [] };
    case "true_false":
      return { type: "true_false", value: false };
    case "fill_blank":
      return { type: "fill_blank", accepted: [] };
    case "free_response":
      return { type: "free_response", rubric: "" };
  }
};

/** Strips everything that would give the answer away. */
export function toExamQuestionView(q: QuizQuestion): ExamQuestionView {
  return { ...q, answer: emptyAnswer(q.answer), explanation: "" };
}

export type ExamContentRef = { contentId: ContentId; title: string };
