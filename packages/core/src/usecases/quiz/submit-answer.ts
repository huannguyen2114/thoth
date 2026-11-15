import type { QuizAttempt, QuizQuestion } from "../../domain/quiz";
import type { LlmProvider } from "../../ports/llm";
import type { ActivityRepository, QuizRepository } from "../../ports/repositories";
import type { QuizQuestionId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { recordActivity } from "../activity";
import { gradeFreeResponse, gradeObjective } from "./grading";
import { type QuizResponse, quizResponseSchema } from "./schemas";

export interface SubmitAnswerDeps {
  quizzes: QuizRepository;
  llm: () => Promise<LlmProvider>;
  activity?: ActivityRepository;
}

export interface SubmittedAnswer {
  attempt: QuizAttempt;
  question: QuizQuestion;
}

/** Grades one answer, stores the attempt, and returns it with the question (explanation, key). */
export async function submitQuizAnswer(
  deps: SubmitAnswerDeps,
  input: { questionId: QuizQuestionId; response: unknown },
): Promise<Result<SubmittedAnswer>> {
  const parsed = quizResponseSchema.safeParse(input.response);
  if (!parsed.success) return err(appError("validation", "That answer is not valid. Try again."));
  const response: QuizResponse = parsed.data;

  const question = await deps.quizzes.getQuestion(input.questionId);
  if (!question) return err(appError("not_found", "This question no longer exists."));

  let grade = gradeObjective(question.answer, response);
  if (!grade) {
    if (question.answer.type !== "free_response" || response.type !== "free_response") {
      return err(appError("validation", "The answer does not match the question type."));
    }
    const r = await gradeFreeResponse(
      await deps.llm(),
      question,
      question.answer.rubric,
      response.text,
    );
    if (!r.ok) return r;
    grade = r.value;
  }

  const attempt = await deps.quizzes.addAttempt({
    questionId: question.id,
    response,
    correct: grade.correct,
    score: grade.score,
    feedback: grade.feedback,
  });
  await recordActivity(deps.activity, "quiz_answer", question.id);
  return ok({ attempt, question });
}
