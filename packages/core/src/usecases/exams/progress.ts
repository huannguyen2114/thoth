import type { Content } from "../../domain/content";
import type { QuizAttempt, QuizQuestion } from "../../domain/quiz";
import type { StudySet } from "../../domain/study-set";
import type {
  ChapterRepository,
  ContentRepository,
  FlashcardRepository,
  QuizRepository,
  SpaceRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { ContentId } from "../../shared/id";
import { appError, err, type Result } from "../../shared/result";
import { type QuizGenerationDeps, startQuizGeneration } from "../quiz/generate-quiz";
import { latestAttempts } from "../quiz/stats";

export interface ProgressDeps {
  spaces: SpaceRepository;
  contents: ContentRepository;
  studySets: StudySetRepository;
  quizzes: QuizRepository;
  flashcards: FlashcardRepository;
}

export interface TopicProgress {
  contentId: ContentId;
  contentTitle: string;
  topic: string;
  /** Mean of the latest score per answered question, 0..1. */
  score: number;
  answered: number;
}

export interface Progress {
  answered: number;
  /** Mean latest score over every answered question, or null with none answered. */
  accuracy: number | null;
  cardsDue: number;
  /** Weakest first: topics under WEAK_THRESHOLD. */
  weak: TopicProgress[];
  /** Every topic with at least one answer, weakest first. */
  topics: TopicProgress[];
}

export const WEAK_THRESHOLD = 0.8;

/** Computed on read from quiz and exam attempts (ADR-0018). */
export async function getProgress(deps: ProgressDeps, now: Date): Promise<Progress> {
  const contents = await deps.contents.listRecent(1000);
  const byId = new Map<string, Content>(contents.map((c) => [c.id, c]));

  const sets: StudySet[] = [];
  for (const c of contents) sets.push(...(await deps.studySets.listByContent(c.id, "quiz")));
  for (const s of await deps.spaces.list()) {
    sets.push(...(await deps.studySets.listBySpace(s.id, "exam")));
  }

  const scores = new Map<string, TopicProgress & { sum: number }>();
  let answered = 0;
  let sum = 0;
  for (const set of sets) {
    const [questions, attempts] = await Promise.all([
      deps.quizzes.listQuestions(set.id),
      deps.quizzes.listAttempts(set.id),
    ]);
    const latest = latestAttempts(attempts);
    for (const q of questions) {
      const a = latest.get(q.id);
      if (!a) continue;
      const contentId = (q.contentId ?? set.contentId) as ContentId | null;
      const content = contentId ? byId.get(contentId) : undefined;
      if (!contentId || !content) continue;
      answered += 1;
      sum += a.score;
      const key = `${contentId}::${q.topic}`;
      const t = scores.get(key) ?? {
        contentId,
        contentTitle: content.title,
        topic: q.topic,
        score: 0,
        answered: 0,
        sum: 0,
      };
      t.sum += a.score;
      t.answered += 1;
      scores.set(key, t);
    }
  }
  const topics = [...scores.values()]
    .map(({ sum: s, ...t }) => ({ ...t, score: s / t.answered }))
    .sort((a, b) => a.score - b.score || a.topic.localeCompare(b.topic));
  const cardsDue = (await deps.flashcards.listDue(now, 10_000)).length;
  return {
    answered,
    accuracy: answered ? sum / answered : null,
    cardsDue,
    weak: topics.filter((t) => t.score < WEAK_THRESHOLD).slice(0, 8),
    topics,
  };
}

/** Questions per "Practice weak spots" quiz. */
export const PRACTICE_COUNT = 5;

/**
 * Starts an ordinary quiz on the chapter behind a weak topic, focused on mistakes.
 * The caller runs `runQuizGeneration` for the returned sets in the background.
 */
export async function startWeakSpotPractice(
  deps: QuizGenerationDeps & { chapters: ChapterRepository },
  input: { contentId: ContentId; topic: string },
): Promise<Result<StudySet[]>> {
  const chapters = await deps.chapters.listByContent(input.contentId);
  const chapter = chapters.find((c) => c.title === input.topic);
  if (chapters.length > 0 && !chapter) {
    return err(appError("not_found", "That topic is no longer in this content."));
  }
  return startQuizGeneration(deps, {
    contentId: input.contentId,
    options: {
      types: ["multiple_choice", "fill_blank", "free_response"],
      difficulty: "medium",
      count: PRACTICE_COUNT,
      chapterIds: chapter ? [chapter.id] : [],
      focus: `The learner keeps getting "${input.topic}" wrong. Target the ideas most often confused, and explain the reasoning clearly.`,
      language: "English",
    },
  });
}

export type { QuizAttempt, QuizQuestion };
