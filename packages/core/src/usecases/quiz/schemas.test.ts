import { describe, expect, it } from "vitest";
import {
  freeResponseGradeSchema,
  generatedQuestionSchema,
  generatedQuizSchema,
  quizOptionsSchema,
  quizResponseSchema,
} from "./schemas";

const base = {
  prompt: "Why does the cell make ATP?",
  explanation: "Because cells need energy.",
  source: "[p.1]",
};

const good = {
  multiple_choice: { ...base, type: "multiple_choice", choices: ["a", "b", "c"], correctIndex: 1 },
  multi_select: {
    ...base,
    type: "multi_select",
    choices: ["a", "b", "c", "d"],
    correctIndices: [0, 2],
  },
  true_false: { ...base, type: "true_false", correct: false },
  fill_blank: {
    ...base,
    type: "fill_blank",
    acceptedAnswers: ["mitochondria", "the mitochondrion"],
  },
  free_response: {
    ...base,
    type: "free_response",
    rubric: "Mentions the proton gradient and ATP synthase.",
  },
} as const;

const bad = {
  multiple_choice: { ...good.multiple_choice, correctIndex: 3 },
  multi_select: { ...good.multi_select, correctIndices: [0, 1, 2, 3] },
  true_false: { ...good.true_false, correct: "yes" },
  fill_blank: { ...good.fill_blank, acceptedAnswers: [] },
  free_response: { ...good.free_response, rubric: "" },
};

describe("generatedQuestionSchema", () => {
  for (const type of Object.keys(good) as (keyof typeof good)[]) {
    it(`accepts a good ${type} reply`, () => {
      expect(generatedQuestionSchema.safeParse(good[type]).success).toBe(true);
    });
    it(`rejects a bad ${type} reply`, () => {
      expect(generatedQuestionSchema.safeParse(bad[type]).success).toBe(false);
    });
  }

  it("rejects an unknown type and a null source is allowed", () => {
    expect(generatedQuestionSchema.safeParse({ ...base, type: "essay" }).success).toBe(false);
    expect(generatedQuestionSchema.safeParse({ ...good.true_false, source: null }).success).toBe(
      true,
    );
  });

  it("rejects duplicate correct indices in multi_select", () => {
    expect(
      generatedQuestionSchema.safeParse({ ...good.multi_select, correctIndices: [1, 1] }).success,
    ).toBe(false);
  });
});

describe("generatedQuizSchema", () => {
  it("accepts a mixed list and rejects an empty one", () => {
    expect(generatedQuizSchema.safeParse({ questions: Object.values(good) }).success).toBe(true);
    expect(generatedQuizSchema.safeParse({ questions: [] }).success).toBe(false);
  });
});

describe("quizOptionsSchema", () => {
  const ok = { types: ["true_false"], difficulty: "hard", count: 10, chapterIds: [] };
  it("fills defaults for focus and language", () => {
    const r = quizOptionsSchema.parse(ok);
    expect(r.focus).toBe("");
    expect(r.language).toBe("English");
  });
  it("rejects no types and out-of-range counts with a fix-it message", () => {
    expect(quizOptionsSchema.safeParse({ ...ok, types: [] }).error?.issues[0]?.message).toMatch(
      /at least one/,
    );
    expect(quizOptionsSchema.safeParse({ ...ok, count: 0 }).success).toBe(false);
    expect(quizOptionsSchema.safeParse({ ...ok, count: 31 }).success).toBe(false);
  });
});

describe("free response grade and response schemas", () => {
  it("bounds the score to 0..1", () => {
    expect(freeResponseGradeSchema.safeParse({ score: 0.5, feedback: "ok" }).success).toBe(true);
    expect(freeResponseGradeSchema.safeParse({ score: 1.5, feedback: "ok" }).success).toBe(false);
    expect(freeResponseGradeSchema.safeParse({ score: 0.5, feedback: "" }).success).toBe(false);
  });
  it("validates the player's response by type", () => {
    expect(quizResponseSchema.safeParse({ type: "multi_select", indices: [0, 1] }).success).toBe(
      true,
    );
    expect(quizResponseSchema.safeParse({ type: "multi_select", index: 0 }).success).toBe(false);
  });
});
