import { z } from "zod";
import { quizDifficulties, quizQuestionTypes } from "../../domain/quiz";

/** What the owner chooses in the Generate dialog. Stored as StudySet.options. */
export const quizOptionsSchema = z.object({
  types: z.array(z.enum(quizQuestionTypes)).min(1, "Pick at least one question type."),
  difficulty: z.enum(quizDifficulties),
  /** Questions per topic quiz. */
  count: z
    .number()
    .int()
    .min(1, "Ask for at least 1 question.")
    .max(30, "Ask for 30 questions or fewer."),
  /** Chapter ids. Empty means every chapter. */
  chapterIds: z.array(z.string()),
  focus: z.string().trim().max(500).default(""),
  language: z.string().trim().min(1).max(40).default("English"),
});
export type QuizOptions = z.infer<typeof quizOptionsSchema>;

const base = {
  prompt: z.string().trim().min(5),
  explanation: z.string().trim().min(5),
  /** A citation token copied from the source, for example "[p.3]" or "[03:21]". */
  source: z.string().nullable(),
};

const choices = (min: number, max: number) => z.array(z.string().trim().min(1)).min(min).max(max);

/** One schema per question type, joined by `type`. The model's reply must match one of them. */
export const generatedQuestionSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("multiple_choice"),
      choices: choices(2, 6),
      correctIndex: z.number().int().min(0),
    })
    .refine((q) => q.correctIndex < q.choices.length, "correctIndex must point at a choice."),
  z
    .object({
      ...base,
      type: z.literal("multi_select"),
      choices: choices(3, 8),
      correctIndices: z.array(z.number().int().min(0)).min(1),
    })
    .refine(
      (q) =>
        new Set(q.correctIndices).size === q.correctIndices.length &&
        q.correctIndices.every((i) => i < q.choices.length) &&
        q.correctIndices.length < q.choices.length,
      "correctIndices must be unique, valid, and leave at least one wrong choice.",
    ),
  z.object({ ...base, type: z.literal("true_false"), correct: z.boolean() }),
  z.object({
    ...base,
    type: z.literal("fill_blank"),
    /** Every spelling that counts as correct. */
    acceptedAnswers: z.array(z.string().trim().min(1)).min(1),
  }),
  z.object({
    ...base,
    type: z.literal("free_response"),
    /** The model answer and the key points a good answer covers. Never shown before answering. */
    rubric: z.string().trim().min(10),
  }),
]);
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export const generatedQuizSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1),
});

/** Reply of the grading call for a free-response answer. */
export const freeResponseGradeSchema = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string().trim().min(1),
});

/** What the player submits. fill_blank and free_response carry text. */
export const quizResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("multiple_choice"), index: z.number().int().min(0) }),
  z.object({ type: z.literal("multi_select"), indices: z.array(z.number().int().min(0)) }),
  z.object({ type: z.literal("true_false"), value: z.boolean() }),
  z.object({ type: z.literal("fill_blank"), text: z.string() }),
  z.object({ type: z.literal("free_response"), text: z.string() }),
]);
export type QuizResponse = z.infer<typeof quizResponseSchema>;
