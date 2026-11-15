import type { QuizAttempt, QuizQuestion } from "../../domain/quiz";

export interface TopicScore {
  topic: string;
  /** Mean of the latest score of each answered question, 0..1. */
  averageScore: number;
  answered: number;
}

/** Latest attempt per question (attempts may arrive in any order). */
export function latestAttempts(attempts: readonly QuizAttempt[]): Map<string, QuizAttempt> {
  const latest = new Map<string, QuizAttempt>();
  for (const a of attempts) {
    const cur = latest.get(a.questionId);
    if (!cur || a.createdAt.getTime() >= cur.createdAt.getTime()) latest.set(a.questionId, a);
  }
  return latest;
}

/** Topics ranked weakest first. Only topics with at least one answered question appear. */
export function topicScores(
  questions: readonly QuizQuestion[],
  attempts: readonly QuizAttempt[],
): TopicScore[] {
  const latest = latestAttempts(attempts);
  const byTopic = new Map<string, number[]>();
  for (const q of questions) {
    const a = latest.get(q.id);
    if (!a) continue;
    byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), a.score]);
  }
  return [...byTopic]
    .map(([topic, scores]) => ({
      topic,
      averageScore: scores.reduce((s, v) => s + v, 0) / scores.length,
      answered: scores.length,
    }))
    .sort((a, b) => a.averageScore - b.averageScore || a.topic.localeCompare(b.topic));
}

/** The weakest topics: those scoring under `threshold`, at most `limit`. */
export function weakTopics(
  scores: readonly TopicScore[],
  limit = 3,
  threshold = 0.8,
): TopicScore[] {
  return scores.filter((s) => s.averageScore < threshold).slice(0, limit);
}
