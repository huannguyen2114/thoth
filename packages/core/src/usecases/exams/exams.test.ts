import { describe, expect, it } from "vitest";
import type { Content, Segment } from "../../domain/content";
import type { ExamSession } from "../../domain/exam";
import type { ContentRepository, ExamSessionRepository } from "../../ports/repositories";
import {
  type ContentId,
  type ExamSessionId,
  newId,
  type SegmentId,
  type SpaceId,
  type StudySetId,
} from "../../shared/id";
import {
  CONTENT_ID,
  FakeLlm,
  fakeChapters,
  fakeSegments,
  MemFlashcards,
  MemQuizzes,
  MemStudySets,
  pageChapters,
  pageSegments,
} from "../quiz/fakes";
import {
  getExamResult,
  runExamGeneration,
  startExam,
  startExamGeneration,
  submitExam,
} from "./exams";
import { getProgress, startWeakSpotPractice } from "./progress";
import { allocateQuestions, sampleAcrossChapters } from "./sampling";

const SPACE = "sp1" as SpaceId;

class MemSessions implements ExamSessionRepository {
  rows: ExamSession[] = [];
  async start(setId: StudySetId, startedAt: Date, deadlineAt: Date) {
    const s: ExamSession = {
      id: newId<ExamSessionId>(),
      setId,
      startedAt,
      deadlineAt,
      submittedAt: null,
      score: null,
    };
    this.rows.unshift(s);
    return s;
  }
  async get(id: ExamSessionId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listBySet(setId: StudySetId) {
    return this.rows.filter((r) => r.setId === setId);
  }
  async submit(id: ExamSessionId, submittedAt: Date, score: number) {
    const s = this.rows.find((r) => r.id === id);
    if (s) Object.assign(s, { submittedAt, score });
  }
}

const content = (status: Content["status"] = "ready"): Content => ({
  id: CONTENT_ID,
  spaceId: SPACE,
  kind: "pdf",
  title: "Cell energy",
  sourceUrl: null,
  filePath: null,
  status,
  error: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const contentsRepo = (c: Content = content()): ContentRepository => ({
  create: async () => c,
  get: async (id) => (id === c.id ? c : null),
  listRecent: async () => [c],
  listBySpace: async (id) => (id === c.spaceId ? [c] : []),
  setStatus: async () => {},
  setTitle: async () => {},
  setSpace: async () => {},
});

/** Two questions: one true/false citing page 1 (chapter ATP), one free response citing page 3. */
const goodReply = () => ({
  questions: [
    {
      type: "true_false",
      prompt: "ATP stores usable energy.",
      explanation: "The source says so on page 1.",
      source: "[p.1]",
      correct: true,
    },
    {
      type: "free_response",
      prompt: "Explain what the Krebs cycle produces.",
      explanation: "It loads electron carriers.",
      source: "[p.3]",
      rubric: "Releases CO2 and loads NADH and FADH2.",
    },
  ],
});

function setup(reply: () => unknown = goodReply, c: Content = content()) {
  const llm = new FakeLlm((req) =>
    req.task === "grading" ? { score: 0.5, feedback: "Half right." } : reply(),
  );
  const deps = {
    contents: contentsRepo(c),
    chapters: fakeChapters(),
    segments: fakeSegments(),
    studySets: new MemStudySets(),
    quizzes: new MemQuizzes(),
    examSessions: new MemSessions(),
    llm: async () => llm,
  };
  return { deps, llm };
}

const options = {
  contentIds: [CONTENT_ID],
  durationMin: 20,
  count: 3,
  types: ["true_false", "free_response"],
  difficulty: "medium",
  language: "English",
};

async function readyExam() {
  const t = setup();
  const set = await startExamGeneration(t.deps, { spaceId: SPACE, options });
  if (!set.ok) throw new Error(set.error.message);
  const run = await runExamGeneration(t.deps, set.value.id);
  if (!run.ok) throw new Error(run.error.message);
  return { ...t, setId: set.value.id };
}

describe("sampling", () => {
  it("allocates questions in proportion to size, at least one each, summing to count", () => {
    expect(allocateQuestions([1000, 3000], 8)).toEqual([2, 6]);
    expect(allocateQuestions([10, 10_000, 10], 3)).toEqual([1, 1, 1]);
    const out = allocateQuestions([5, 7, 11], 20);
    expect(out.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it("samples every chapter of a long source, not just its start", () => {
    const long: Segment[] = [1, 2, 3, 4].map((p, i) => ({
      id: `s${p}` as SegmentId,
      contentId: CONTENT_ID,
      idx: i,
      text: "x".repeat(400),
      locator: { type: "page", page: p },
    }));
    const picked = sampleAcrossChapters(pageChapters, long, 900);
    const pages = picked.map((s) => (s.locator.type === "page" ? s.locator.page : 0));
    expect(pages.some((p) => p < 3)).toBe(true); // chapter 1 (pages 1-2)
    expect(pages.some((p) => p >= 3)).toBe(true); // chapter 2 (pages 3-4)
    expect(picked.reduce((n, s) => n + s.text.length, 0)).toBeLessThanOrEqual(900);
  });
});

describe("exam generation", () => {
  it("rejects contents outside the space and unfinished contents", async () => {
    const t = setup();
    const r = await startExamGeneration(t.deps, {
      spaceId: SPACE,
      options: { ...options, contentIds: ["other" as ContentId] },
    });
    expect(r.ok === false && r.error.message).toMatch(/this space/);
    const t2 = setup(goodReply, content("processing"));
    const r2 = await startExamGeneration(t2.deps, { spaceId: SPACE, options });
    expect(r2.ok === false && r2.error.message).toMatch(/finished processing/);
  });

  it("stores questions with content id and chapter topics, then marks the set ready", async () => {
    const { deps, setId } = await readyExam();
    expect((await deps.studySets.get(setId))?.status).toBe("ready");
    const qs = await deps.quizzes.listQuestions(setId);
    expect(qs.map((q) => q.topic)).toEqual(["ATP", "Krebs cycle"]);
    expect(qs.every((q) => q.contentId === CONTENT_ID)).toBe(true);
  });

  it("marks the set failed with a reason when the model reply is unusable", async () => {
    const t = setup(() => ({ nope: true }));
    const set = await startExamGeneration(t.deps, { spaceId: SPACE, options });
    if (!set.ok) throw new Error("setup");
    const r = await runExamGeneration(t.deps, set.value.id);
    expect(r.ok).toBe(false);
    expect((await t.deps.studySets.get(set.value.id))?.status).toBe("failed");
  });
});

describe("sitting an exam", () => {
  const t0 = new Date(2026, 0, 1, 0, 0, 0);

  it("hides answer keys and explanations, and resumes an open sitting", async () => {
    const { deps, setId } = await readyExam();
    const first = await startExam(deps, setId, t0);
    if (!first.ok) throw new Error(first.error.message);
    expect(first.value.questions[0]?.answer).toEqual({ type: "true_false", value: false });
    expect(first.value.questions[1]?.answer).toEqual({ type: "free_response", rubric: "" });
    expect(first.value.questions.every((q) => q.explanation === "")).toBe(true);
    expect(first.value.session.deadlineAt.getTime() - t0.getTime()).toBe(20 * 60_000);

    const again = await startExam(deps, setId, new Date(t0.getTime() + 60_000));
    expect(again.ok && again.value.session.id).toBe(first.value.session.id);
  });

  it("grades answered questions, counts unanswered as 0, and is idempotent", async () => {
    const { deps, setId } = await readyExam();
    const sit = await startExam(deps, setId, t0);
    if (!sit.ok) throw new Error(sit.error.message);
    const [tf] = sit.value.questions;
    if (!tf) throw new Error("no question");

    const done = new Date(t0.getTime() + 10 * 60_000);
    const r = await submitExam(
      deps,
      {
        sessionId: sit.value.session.id,
        responses: { [tf.id]: { type: "true_false", value: true } },
      },
      done,
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.session.score).toBe(0.5); // 1 right + 1 unanswered
    expect(r.value.late).toBe(false);
    expect(r.value.topics.map((x) => [x.topic, x.score])).toEqual([
      ["Krebs cycle", 0],
      ["ATP", 1],
    ]);

    const again = await submitExam(
      deps,
      { sessionId: sit.value.session.id, responses: {} },
      new Date(done.getTime() + 1000),
    );
    expect(again.ok && again.value.session.score).toBe(0.5);
    expect(deps.quizzes.attempts).toHaveLength(1);
  });

  it("grades free responses with the model and flags late submits", async () => {
    const { deps, setId, llm } = await readyExam();
    const sit = await startExam(deps, setId, t0);
    if (!sit.ok) throw new Error(sit.error.message);
    const fr = sit.value.questions[1];
    if (!fr) throw new Error("no question");
    const late = new Date(t0.getTime() + 25 * 60_000);
    const r = await submitExam(
      deps,
      {
        sessionId: sit.value.session.id,
        responses: { [fr.id]: { type: "free_response", text: "It makes NADH." } },
      },
      late,
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(llm.requests.some((q) => q.task === "grading")).toBe(true);
    expect(r.value.session.score).toBe(0.25);
    expect(r.value.late).toBe(true);
    const result = await getExamResult(deps, sit.value.session.id);
    expect(result.ok && result.value.items[1]?.attempt?.feedback).toBe("Half right.");
  });
});

describe("progress", () => {
  it("ranks topics across exams, counts due cards, and starts weak-spot practice", async () => {
    const { deps, setId } = await readyExam();
    const sit = await startExam(deps, setId, new Date(2026, 0, 1));
    if (!sit.ok) throw new Error(sit.error.message);
    const [tf] = sit.value.questions;
    if (!tf) throw new Error("no question");
    await submitExam(
      deps,
      {
        sessionId: sit.value.session.id,
        responses: { [tf.id]: { type: "true_false", value: false } },
      },
      new Date(2026, 0, 1, 0, 5),
    );
    const progress = await getProgress(
      {
        ...deps,
        spaces: {
          create: async () => {
            throw new Error("unused");
          },
          get: async () => null,
          list: async () => [
            {
              id: SPACE,
              name: "Bio",
              description: null,
              createdAt: new Date(0),
              updatedAt: new Date(0),
            },
          ],
        },
        flashcards: new MemFlashcards(),
      },
      new Date(2026, 0, 2),
    );
    expect(progress.answered).toBe(1);
    expect(progress.accuracy).toBe(0);
    expect(progress.weak[0]).toMatchObject({ contentId: CONTENT_ID, topic: "ATP", score: 0 });

    const practice = await startWeakSpotPractice(deps, { contentId: CONTENT_ID, topic: "ATP" });
    expect(practice.ok && practice.value.map((s) => s.title)).toEqual(["Quiz 1: ATP"]);
    const missing = await startWeakSpotPractice(deps, { contentId: CONTENT_ID, topic: "Gone" });
    expect(missing.ok).toBe(false);
  });
});

void pageSegments;
