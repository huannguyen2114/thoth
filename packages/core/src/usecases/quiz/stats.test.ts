import { describe, expect, it } from "vitest";
import type { QuizAttempt, QuizQuestion } from "../../domain/quiz";
import type { QuizAttemptId, QuizQuestionId, StudySetId } from "../../shared/id";
import { latestAttempts, topicScores, weakTopics } from "./stats";

const q = (id: string, topic: string) =>
  ({ id: id as QuizQuestionId, setId: "s" as StudySetId, topic }) as QuizQuestion;
const a = (qid: string, score: number, sec: number) =>
  ({
    id: `${qid}${sec}` as QuizAttemptId,
    questionId: qid as QuizQuestionId,
    score,
    correct: score === 1,
    createdAt: new Date(2026, 0, 1, 0, 0, sec),
  }) as QuizAttempt;

describe("topicScores", () => {
  const questions = [
    q("1", "ATP"),
    q("2", "ATP"),
    q("3", "Krebs"),
    q("4", "Krebs"),
    q("5", "Fermentation"),
  ];

  it("averages the latest attempt of each question per topic, weakest first", () => {
    const attempts = [a("1", 1, 1), a("2", 0.5, 2), a("3", 0, 3), a("4", 0.5, 4)];
    expect(topicScores(questions, attempts)).toEqual([
      { topic: "Krebs", averageScore: 0.25, answered: 2 },
      { topic: "ATP", averageScore: 0.75, answered: 2 },
    ]);
  });

  it("uses only the latest attempt, so a retry replaces an old score", () => {
    const attempts = [a("3", 0, 1), a("3", 1, 9), a("4", 1, 2)];
    expect(topicScores(questions, attempts)).toEqual([
      { topic: "Krebs", averageScore: 1, answered: 2 },
    ]);
    expect(latestAttempts(attempts).get("3")?.score).toBe(1);
  });

  it("skips topics with no attempts and handles no data", () => {
    expect(topicScores(questions, [])).toEqual([]);
  });
});

describe("weakTopics", () => {
  const scores = [
    { topic: "A", averageScore: 0.2, answered: 3 },
    { topic: "B", averageScore: 0.6, answered: 3 },
    { topic: "C", averageScore: 0.79, answered: 3 },
    { topic: "D", averageScore: 0.95, answered: 3 },
  ];
  it("keeps topics under the threshold, up to the limit", () => {
    expect(weakTopics(scores).map((s) => s.topic)).toEqual(["A", "B", "C"]);
    expect(weakTopics(scores, 2).map((s) => s.topic)).toEqual(["A", "B"]);
    expect(weakTopics(scores.slice(3))).toEqual([]);
  });
});
