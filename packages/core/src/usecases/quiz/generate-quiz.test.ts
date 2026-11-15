import { describe, expect, it } from "vitest";
import {
  CONTENT_ID,
  FakeLlm,
  fakeChapters,
  fakeContent,
  fakeSegments,
  MemQuizzes,
  MemStudySets,
} from "./fakes";
import { runQuizGeneration, startQuizGeneration, toNewQuestions } from "./generate-quiz";
import { getQuizOverview } from "./overview";
import { submitQuizAnswer } from "./submit-answer";

const mixed = [
  {
    type: "multiple_choice",
    prompt: "Why ATP?",
    explanation: "Energy currency.",
    source: "[p.1]",
    choices: ["a", "b", "c"],
    correctIndex: 1,
  },
  {
    type: "multi_select",
    prompt: "Which make ATP?",
    explanation: "Both do.",
    source: "[p.2]",
    choices: ["a", "b", "c", "d"],
    correctIndices: [3, 0],
  },
  {
    type: "true_false",
    prompt: "ATP stores energy?",
    explanation: "Yes, it does.",
    source: null,
    correct: true,
  },
  {
    type: "fill_blank",
    prompt: "The _____ is the powerhouse.",
    explanation: "Mitochondria.",
    source: "[p.99]",
    acceptedAnswers: ["mitochondria"],
  },
  {
    type: "free_response",
    prompt: "Explain glycolysis.",
    explanation: "Splits glucose.",
    source: "[p.2]",
    rubric: "Glucose to pyruvate, 2 ATP net.",
  },
];

function setup(
  reply: () => unknown = () => ({ questions: mixed }),
  status: "ready" | "processing" = "ready",
) {
  const llm = new FakeLlm(reply);
  const deps = {
    contents: fakeContent(status),
    chapters: fakeChapters(),
    segments: fakeSegments(),
    studySets: new MemStudySets(),
    quizzes: new MemQuizzes(),
    llm: async () => llm,
  };
  return { deps, llm };
}
const options = {
  types: ["multiple_choice", "multi_select", "true_false", "fill_blank", "free_response"],
  difficulty: "hard",
  count: 5,
  chapterIds: [],
};

describe("startQuizGeneration", () => {
  it("creates one generating set per chapter titled 'Quiz N: topic'", async () => {
    const { deps } = setup();
    const r = await startQuizGeneration(deps, { contentId: CONTENT_ID, options });
    expect(r.ok && r.value.map((s) => [s.title, s.status])).toEqual([
      ["Quiz 1: ATP", "generating"],
      ["Quiz 2: Krebs cycle", "generating"],
    ]);
  });

  it("limits to the chosen chapters and numbers on from existing quizzes", async () => {
    const { deps } = setup();
    await startQuizGeneration(deps, { contentId: CONTENT_ID, options });
    const r = await startQuizGeneration(deps, {
      contentId: CONTENT_ID,
      options: { ...options, chapterIds: ["ch2"] },
    });
    expect(r.ok && r.value.map((s) => s.title)).toEqual(["Quiz 3: Krebs cycle"]);
  });

  it("rejects bad options, an unknown topic selection and content that is not ready", async () => {
    const { deps } = setup();
    expect(
      await startQuizGeneration(deps, {
        contentId: CONTENT_ID,
        options: { ...options, types: [] },
      }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(
      await startQuizGeneration(deps, {
        contentId: CONTENT_ID,
        options: { ...options, chapterIds: ["nope"] },
      }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    const busy = setup(undefined, "processing");
    expect(await startQuizGeneration(busy.deps, { contentId: CONTENT_ID, options })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
  });
});

describe("runQuizGeneration", () => {
  it("stores a mixed set with answers, difficulty, topic and resolved locators", async () => {
    const { deps, llm } = setup();
    const started = await startQuizGeneration(deps, {
      contentId: CONTENT_ID,
      options: { ...options, chapterIds: ["ch1"] },
    });
    if (!started.ok) throw new Error("start failed");
    const set = started.value[0];
    if (!set) throw new Error("no set");
    const r = await runQuizGeneration(deps, set.id);
    expect(r.ok).toBe(true);
    const qs = await deps.quizzes.listQuestions(set.id);
    expect(qs.map((q) => q.type)).toEqual([
      "multiple_choice",
      "multi_select",
      "true_false",
      "fill_blank",
      "free_response",
    ]);
    expect(qs[1]?.answer).toEqual({ type: "multi_select", indices: [0, 3] });
    expect(qs[0]).toMatchObject({
      difficulty: "hard",
      topic: "ATP",
      locator: { type: "page", page: 1 },
    });
    expect(qs[2]?.locator).toBeNull();
    expect(qs[3]?.locator).toBeNull(); // [p.99] is not in this content
    expect((await deps.studySets.get(set.id))?.status).toBe("ready");
    // Only this chapter's pages (1 and 2) reach the model, with citation tokens.
    expect(llm.requests[0]?.task).toBe("quiz");
    expect(llm.requests[0]?.context).toContain("[p.2] Text of page 2.");
    expect(llm.requests[0]?.context).not.toContain("[p.3]");
  });

  it("marks the set failed when the reply does not match the schema", async () => {
    const { deps } = setup(() => ({
      questions: [
        {
          type: "multiple_choice",
          prompt: "Q?????",
          explanation: "E?????",
          source: null,
          choices: ["a", "b"],
          correctIndex: 7,
        },
      ],
    }));
    const started = await startQuizGeneration(deps, {
      contentId: CONTENT_ID,
      options: { ...options, chapterIds: ["ch1"] },
    });
    if (!started.ok || !started.value[0]) throw new Error("start failed");
    const r = await runQuizGeneration(deps, started.value[0].id);
    expect(r).toMatchObject({ ok: false, error: { code: "llm_bad_output" } });
    expect((await deps.studySets.get(started.value[0].id))?.status).toBe("failed");
    expect(deps.quizzes.questions).toHaveLength(0);
  });

  it("fails when the model only wrote types that were not requested", async () => {
    const { deps } = setup();
    const started = await startQuizGeneration(deps, {
      contentId: CONTENT_ID,
      options: { ...options, types: ["true_false"], chapterIds: ["ch1"] },
    });
    if (!started.ok || !started.value[0]) throw new Error("start failed");
    const { deps: d2 } = setup(() => ({ questions: [mixed[0]] }));
    d2.studySets.rows = deps.studySets.rows;
    expect(await runQuizGeneration(d2, started.value[0].id)).toMatchObject({
      ok: false,
      error: { code: "llm_bad_output" },
    });
  });
});

describe("toNewQuestions", () => {
  it("drops unrequested types and caps at the requested count", () => {
    const parsed = mixed.map((m) => m) as never;
    const out = toNewQuestions(
      parsed,
      { types: ["true_false", "fill_blank"], difficulty: "easy", count: 1 },
      "ATP",
      [],
    );
    expect(out.map((q) => q.type)).toEqual(["true_false"]);
  });
});

describe("submitQuizAnswer and overview", () => {
  it("grades, stores each attempt, and reports weak topics", async () => {
    const llm = new FakeLlm(() => ({ questions: mixed }));
    const { deps } = setup();
    const grading = new FakeLlm(() => ({ score: 0.4, feedback: "You missed the net ATP." }));
    const started = await startQuizGeneration(deps, {
      contentId: CONTENT_ID,
      options: { ...options, chapterIds: ["ch1"] },
    });
    if (!started.ok || !started.value[0]) throw new Error("start failed");
    await runQuizGeneration({ ...deps, llm: async () => llm }, started.value[0].id);
    const [mc, ms, , fb, fr] = await deps.quizzes.listQuestions(started.value[0].id);
    if (!mc || !ms || !fb || !fr) throw new Error("questions missing");
    const sd = { quizzes: deps.quizzes, llm: async () => grading };

    const right = await submitQuizAnswer(sd, {
      questionId: mc.id,
      response: { type: "multiple_choice", index: 1 },
    });
    expect(right.ok && right.value.attempt).toMatchObject({ correct: true, score: 1 });
    const partial = await submitQuizAnswer(sd, {
      questionId: ms.id,
      response: { type: "multi_select", indices: [0] },
    });
    expect(partial.ok && partial.value.attempt.score).toBeCloseTo(0.5);
    const blank = await submitQuizAnswer(sd, {
      questionId: fb.id,
      response: { type: "fill_blank", text: "Mitochondria" },
    });
    expect(blank.ok && blank.value.attempt.correct).toBe(true);
    const free = await submitQuizAnswer(sd, {
      questionId: fr.id,
      response: { type: "free_response", text: "It splits glucose." },
    });
    expect(free.ok && free.value.attempt).toMatchObject({
      correct: false,
      score: 0.4,
      feedback: "You missed the net ATP.",
    });
    expect(grading.requests).toHaveLength(1);
    expect(deps.quizzes.attempts).toHaveLength(4);

    const overview = await getQuizOverview(deps, CONTENT_ID);
    expect(overview.sets[0]).toMatchObject({ questionCount: 5, answered: 4 });
    expect(overview.sets[0]?.averageScore).toBeCloseTo((1 + 0.5 + 1 + 0.4) / 4);
    expect(overview.weakTopics.map((t) => t.topic)).toEqual(["ATP"]);
  });

  it("rejects a malformed response, a missing question and a type mismatch without a model call", async () => {
    const { deps } = setup();
    const grading = new FakeLlm(() => ({}));
    const sd = { quizzes: deps.quizzes, llm: async () => grading };
    const [row] = await deps.quizzes.addQuestions("s" as never, [
      {
        idx: 0,
        type: "true_false",
        difficulty: "easy",
        prompt: "p",
        choices: null,
        answer: { type: "true_false", value: true },
        explanation: "e",
        topic: "t",
        locator: null,
      },
    ]);
    if (!row) throw new Error("no row");
    expect(
      await submitQuizAnswer(sd, { questionId: row.id, response: { type: "nope" } }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(
      await submitQuizAnswer(sd, {
        questionId: "x" as never,
        response: { type: "true_false", value: true },
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(
      await submitQuizAnswer(sd, {
        questionId: row.id,
        response: { type: "free_response", text: "x" },
      }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(grading.requests).toHaveLength(0);
    expect(deps.quizzes.attempts).toHaveLength(0);
  });
});
