import type { QuizAnswer, QuizQuestion } from "../../domain/quiz";
import type { LlmProvider } from "../../ports/llm";
import { appError, err, ok, type Result } from "../../shared/result";
import { GRADING_SYSTEM, gradingUserMessage } from "./prompts";
import { freeResponseGradeSchema, type QuizResponse } from "./schemas";

export interface Grade {
  correct: boolean;
  /** 0..1 */
  score: number;
  feedback: string | null;
}

/** A free-response answer counts as correct from this score up. */
export const FREE_RESPONSE_PASS = 0.7;

/** Lowercase, no accents, no punctuation, single spaces, no leading article. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

/**
 * Grades every type except free response, with no model call.
 * multi_select earns partial credit: each right pick adds, each wrong pick subtracts, floor 0.
 */
export function gradeObjective(answer: QuizAnswer, response: QuizResponse): Grade | null {
  if (answer.type !== response.type) return null;
  switch (answer.type) {
    case "multiple_choice": {
      const right = response.type === "multiple_choice" && response.index === answer.index;
      return { correct: right, score: right ? 1 : 0, feedback: null };
    }
    case "true_false": {
      const right = response.type === "true_false" && response.value === answer.value;
      return { correct: right, score: right ? 1 : 0, feedback: null };
    }
    case "fill_blank": {
      if (response.type !== "fill_blank") return null;
      const given = normalizeAnswer(response.text);
      const right = given !== "" && answer.accepted.some((a) => normalizeAnswer(a) === given);
      return { correct: right, score: right ? 1 : 0, feedback: null };
    }
    case "multi_select": {
      if (response.type !== "multi_select") return null;
      const correct = new Set(answer.indices);
      const picked = new Set(response.indices);
      let hits = 0;
      let misses = 0;
      for (const i of picked) correct.has(i) ? hits++ : misses++;
      const score = Math.max(0, (hits - misses) / correct.size);
      const exact = hits === correct.size && misses === 0;
      return { correct: exact, score: Math.min(1, score), feedback: null };
    }
    case "free_response":
      return null;
  }
}

/** Free response: the model scores the answer against the rubric (task "grading"). */
export async function gradeFreeResponse(
  llm: LlmProvider,
  question: Pick<QuizQuestion, "prompt">,
  rubric: string,
  answerText: string,
): Promise<Result<Grade>> {
  const answer = answerText.trim();
  if (!answer) return err(appError("validation", "Write an answer before you submit."));
  const r = await llm.generateObject(
    {
      task: "grading",
      system: GRADING_SYSTEM,
      messages: [
        {
          role: "user",
          content: gradingUserMessage({ question: question.prompt, rubric, answer }),
        },
      ],
    },
    freeResponseGradeSchema,
  );
  if (!r.ok) return r;
  return ok({
    correct: r.value.score >= FREE_RESPONSE_PASS,
    score: r.value.score,
    feedback: r.value.feedback,
  });
}
