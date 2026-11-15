import { describe, expect, it } from "vitest";
import { CONTENT_ID, MemQuizzes, MemStudySets } from "./quiz/fakes";
import { getQuizOverview, getQuizQuestions } from "./quiz/overview";
import { INTERRUPTED_MESSAGE, STALE_GENERATING_MS } from "./study-sets";

describe("stale generating sets (ADR-0016)", () => {
  it("marks a quiz set failed after 15 minutes and saves it, leaving fresh ones alone", async () => {
    const studySets = new MemStudySets();
    const quizzes = new MemQuizzes();
    const old = await studySets.create({
      kind: "quiz",
      contentId: CONTENT_ID,
      spaceId: null,
      title: "Quiz 1: Old",
      options: {},
      status: "generating",
    });
    const t = old.updatedAt.getTime();
    const fresh = await studySets.create({
      kind: "quiz",
      contentId: CONTENT_ID,
      spaceId: null,
      title: "Quiz 2: Fresh",
      options: {},
      status: "generating",
    });
    await studySets.update(fresh.id, { updatedAt: new Date(t + STALE_GENERATING_MS) } as never);

    const overview = await getQuizOverview(
      { studySets, quizzes },
      CONTENT_ID,
      new Date(t + STALE_GENERATING_MS + 1000),
    );
    const byTitle = Object.fromEntries(overview.sets.map((s) => [s.set.title, s.set]));
    expect(byTitle["Quiz 1: Old"]).toMatchObject({ status: "failed", error: INTERRUPTED_MESSAGE });
    expect(byTitle["Quiz 2: Fresh"]?.status).toBe("generating");
    expect((await studySets.get(old.id))?.status).toBe("failed");
  });
});

describe("practice quiz answers are hidden until answered (ADR-0018)", () => {
  it("returns questions without answer keys or explanations", async () => {
    const quizzes = new MemQuizzes();
    const [q] = await quizzes.addQuestions("set" as never, [
      {
        idx: 0,
        type: "multiple_choice",
        difficulty: "easy",
        prompt: "What makes ATP?",
        choices: ["Mitochondria", "Nucleus"],
        answer: { type: "multiple_choice", index: 0 },
        explanation: "Mitochondria do.",
        topic: "Cells",
        locator: null,
      },
    ]);
    const [shown] = await getQuizQuestions({ quizzes }, "set" as never);
    expect(shown?.answer).toEqual({ type: "multiple_choice", index: -1 });
    expect(shown?.explanation).toBe("");
    expect(shown?.choices).toEqual(q?.choices);
  });
});
