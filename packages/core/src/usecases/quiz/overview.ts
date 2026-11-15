import { hideAnswer, type QuizAttempt, type QuizQuestion } from "../../domain/quiz";
import type { StudySet } from "../../domain/study-set";
import type { QuizRepository, StudySetRepository } from "../../ports/repositories";
import type { ContentId, StudySetId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { failStaleSets } from "../study-sets";
import { latestAttempts, type TopicScore, topicScores, weakTopics } from "./stats";

export interface QuizDeps {
  studySets: StudySetRepository;
  quizzes: QuizRepository;
}

export interface QuizSetSummary {
  set: StudySet;
  questionCount: number;
  answered: number;
  /** Mean latest score over answered questions, or null if none answered. */
  averageScore: number | null;
}

export interface QuizOverview {
  /** Oldest first, so "next quiz" is the following entry. */
  sets: QuizSetSummary[];
  /** Weakest topics across every quiz of this content. */
  weakTopics: TopicScore[];
}

/** Quiz sets of one content with progress, plus the topics the learner is weakest in. */
export async function getQuizOverview(
  deps: QuizDeps,
  contentId: ContentId,
  now: Date = new Date(),
): Promise<QuizOverview> {
  const listed = await deps.studySets.listByContent(contentId, "quiz");
  const sets = (await failStaleSets(deps.studySets, listed, now)).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const allQuestions: QuizQuestion[] = [];
  const allAttempts: QuizAttempt[] = [];
  const summaries: QuizSetSummary[] = [];
  for (const set of sets) {
    const [questions, attempts] = await Promise.all([
      deps.quizzes.listQuestions(set.id),
      deps.quizzes.listAttempts(set.id),
    ]);
    allQuestions.push(...questions);
    allAttempts.push(...attempts);
    const latest = latestAttempts(attempts);
    const scores = questions.flatMap((q) => latest.get(q.id)?.score ?? []);
    summaries.push({
      set,
      questionCount: questions.length,
      answered: scores.length,
      averageScore: scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null,
    });
  }
  return {
    sets: summaries,
    weakTopics: weakTopics(topicScores(allQuestions, allAttempts)),
  };
}

/**
 * Questions of one set, in order, with answers hidden (`hideAnswer`). The player gets each
 * full question back from `submitQuizAnswer` once it is answered.
 */
export async function getQuizQuestions(
  deps: Pick<QuizDeps, "quizzes">,
  setId: StudySetId,
): Promise<QuizQuestion[]> {
  return (await deps.quizzes.listQuestions(setId)).sort((a, b) => a.idx - b.idx).map(hideAnswer);
}

export async function deleteQuizSet(deps: QuizDeps, setId: StudySetId): Promise<Result<void>> {
  const set = await deps.studySets.get(setId);
  if (!set || set.kind !== "quiz") return err(appError("not_found", "This quiz no longer exists."));
  await deps.studySets.delete(setId);
  return ok(undefined);
}
