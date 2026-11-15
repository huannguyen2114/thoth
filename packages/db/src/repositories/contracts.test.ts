import { fileURLToPath } from "node:url";
import { newFsrsState } from "@thoth/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db, migrateDb } from "../client";
import { DrizzleChapterRepository } from "./chapter-repository";
import { DrizzleChatRepository } from "./chat-repository";
import { DrizzleContentRepository } from "./content-repository";
import { DrizzleFlashcardRepository } from "./flashcard-repository";
import { DrizzleJobRepository } from "./job-repository";
import { DrizzleNoteRepository } from "./note-repository";
import { DrizzleQuizRepository } from "./quiz-repository";
import { DrizzleSegmentRepository, toFtsQuery } from "./segment-repository";
import { DrizzleStudySetRepository } from "./study-set-repository";

let db: Db;
beforeEach(async () => {
  db = createDb(":memory:");
  await migrateDb(db, fileURLToPath(new URL("../../drizzle", import.meta.url)));
});

const newContent = (db: Db, title = "Cells") =>
  new DrizzleContentRepository(db).create({
    spaceId: null,
    kind: "pdf",
    title,
    sourceUrl: null,
    filePath: null,
  });

describe("MVP contract repositories", () => {
  it("contents: create, status, recent", async () => {
    const repo = new DrizzleContentRepository(db);
    const c = await newContent(db);
    expect(c.status).toBe("pending");
    await repo.setStatus(c.id, "failed", "No transcript");
    expect(await repo.get(c.id)).toMatchObject({ status: "failed", error: "No transcript" });
    expect((await repo.listRecent(5)).map((x) => x.id)).toEqual([c.id]);
  });

  it("segments: replace, list in order, FTS search scoped by content", async () => {
    const repo = new DrizzleSegmentRepository(db);
    const a = await newContent(db, "A");
    const b = await newContent(db, "B");
    await repo.replaceForContent(a.id, [
      {
        idx: 1,
        text: "Ribosomes translate mRNA into proteins.",
        locator: { type: "page", page: 2 },
      },
      {
        idx: 0,
        text: "Mitochondria produce ATP for the cell.",
        locator: { type: "page", page: 1 },
      },
    ]);
    await repo.replaceForContent(b.id, [
      { idx: 0, text: "Mitochondria appear here too.", locator: { type: "page", page: 1 } },
    ]);
    expect((await repo.listByContent(a.id)).map((s) => s.idx)).toEqual([0, 1]);

    const hits = await repo.search([a.id], "What do mitochondria make?", 5);
    expect(hits.map((h) => h.segment.locator)).toEqual([{ type: "page", page: 1 }]);
    expect(await repo.search([a.id], "   ", 5)).toEqual([]);

    // Replacing removes old index rows too.
    await repo.replaceForContent(a.id, []);
    expect(await repo.search([a.id], "mitochondria", 5)).toEqual([]);
    expect(await repo.search([b.id], "mitochondria", 5)).toHaveLength(1);
  });

  it("toFtsQuery quotes terms and drops punctuation", () => {
    expect(toFtsQuery('What is "ATP"?')).toBe('"what" OR "is" OR "atp"');
    expect(toFtsQuery("?!")).toBe("");
  });

  it("chapters, chats, notes, study sets", async () => {
    const c = await newContent(db);
    const chapters = new DrizzleChapterRepository(db);
    await chapters.replaceForContent(c.id, [
      { idx: 0, title: "Intro", summary: "S", locator: { type: "time", startSec: 0, endSec: 42 } },
    ]);
    expect(await chapters.listByContent(c.id)).toHaveLength(1);

    const chatRepo = new DrizzleChatRepository(db);
    const chat = await chatRepo.create(c.id, "First chat");
    await chatRepo.addMessage(chat.id, "user", "Why?", []);
    await chatRepo.addMessage(chat.id, "assistant", "Because [p.1].", [{ type: "page", page: 1 }]);
    const msgs = await chatRepo.listMessages(chat.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1]?.citations).toEqual([{ type: "page", page: 1 }]);

    const notes = new DrizzleNoteRepository(db);
    await notes.save(c.id, "# One");
    await notes.save(c.id, "# Two");
    expect((await notes.get(c.id))?.markdown).toBe("# Two");

    const sets = new DrizzleStudySetRepository(db);
    const s = await sets.create({
      kind: "summary",
      contentId: c.id,
      spaceId: null,
      title: "Detailed summary",
      options: { template: "detailed" },
      status: "generating",
    });
    await sets.update(s.id, { body: "## Points", status: "ready" });
    expect(await sets.get(s.id)).toMatchObject({ body: "## Points", status: "ready" });
    expect(await sets.listByContent(c.id, "quiz")).toEqual([]);
    await expect(
      sets.create({ kind: "exam", contentId: null, spaceId: null, title: "x", options: {} }),
    ).rejects.toThrow();
  });

  it("quiz questions and attempts", async () => {
    const c = await newContent(db);
    const set = await new DrizzleStudySetRepository(db).create({
      kind: "quiz",
      contentId: c.id,
      spaceId: null,
      title: "Quiz 1: Cells",
      options: {},
    });
    const quiz = new DrizzleQuizRepository(db);
    const [q] = await quiz.addQuestions(set.id, [
      {
        idx: 0,
        type: "multiple_choice",
        difficulty: "easy",
        prompt: "What makes ATP?",
        choices: ["Mitochondria", "Ribosome", "Nucleus", "Golgi"],
        answer: { type: "multiple_choice", index: 0 },
        explanation: "Mitochondria run oxidative phosphorylation.",
        topic: "Cells",
        locator: { type: "page", page: 1 },
      },
    ]);
    if (!q) throw new Error("no question");
    expect(q.answer).toEqual({ type: "multiple_choice", index: 0 });
    await quiz.addAttempt({
      questionId: q.id,
      response: { index: 0 },
      correct: true,
      score: 1,
      feedback: null,
    });
    expect(await quiz.listAttempts(set.id)).toHaveLength(1);
  });

  it("flashcards: new cards are due now; review reschedules and logs", async () => {
    const c = await newContent(db);
    const set = await new DrizzleStudySetRepository(db).create({
      kind: "flashcards",
      contentId: c.id,
      spaceId: null,
      title: "Cells",
      options: {},
    });
    const repo = new DrizzleFlashcardRepository(db);
    const now = new Date("2026-11-15T10:00:00Z");
    const [card] = await repo.addCards(
      set.id,
      [{ idx: 0, front: "ATP?", back: "Energy", topic: "Cells", locator: null }],
      now,
    );
    if (!card) throw new Error("no card");
    expect(await repo.listDue(now, 10)).toHaveLength(1);

    const later = new Date("2026-11-18T10:00:00Z");
    await repo.recordReview(
      card.id,
      3,
      { ...newFsrsState(later), reps: 1, state: 2, lastReview: now },
      now,
    );
    expect(await repo.listDue(now, 10)).toHaveLength(0);
    expect((await repo.get(card.id))?.fsrs).toMatchObject({ reps: 1, state: 2, due: later });
  });

  it("jobs: claim once, retry, then fail", async () => {
    const repo = new DrizzleJobRepository(db);
    const now = new Date();
    const job = await repo.enqueue("ingest", { contentId: "x" }, now);
    const claimed = await repo.claimNext(now);
    expect(claimed).toMatchObject({ id: job.id, status: "running", attempts: 1 });
    expect(await repo.claimNext(now)).toBeNull();
    await repo.fail(job.id, "timeout", now);
    expect((await repo.claimNext(now))?.attempts).toBe(2);
    await repo.fail(job.id, "timeout", null);
    expect((await repo.get(job.id))?.status).toBe("failed");
  });

  it("jobs: requeueRunning puts interrupted jobs back in the queue", async () => {
    const repo = new DrizzleJobRepository(db);
    const now = new Date();
    const job = await repo.enqueue("ingest", {}, now);
    await repo.claimNext(now);
    expect(await repo.requeueRunning()).toBe(1);
    expect((await repo.get(job.id))?.status).toBe("queued");
    expect(await repo.requeueRunning()).toBe(0);
  });

  it("deleting a content cascades to its children", async () => {
    const c = await newContent(db);
    await new DrizzleChapterRepository(db).replaceForContent(c.id, [
      { idx: 0, title: "T", summary: "S", locator: { type: "page", page: 1 } },
    ]);
    const { contents } = await import("../schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(contents).where(eq(contents.id, c.id));
    expect(await new DrizzleChapterRepository(db).listByContent(c.id)).toEqual([]);
  });
});

describe("Phase 7 contracts", () => {
  it("contents.setSpace moves a content in and out of a space", async () => {
    const { DrizzleSpaceRepository } = await import("./space-repository");
    const space = await new DrizzleSpaceRepository(db).create({ name: "Bio", description: null });
    const repo = new DrizzleContentRepository(db);
    const c = await newContent(db);
    await repo.setSpace(c.id, space.id);
    expect((await repo.listBySpace(space.id)).map((x) => x.id)).toEqual([c.id]);
    await repo.setSpace(c.id, null);
    expect(await repo.listBySpace(space.id)).toEqual([]);
  });

  it("exam sessions: start, list newest first, submit; question keeps its content id", async () => {
    const { DrizzleSpaceRepository } = await import("./space-repository");
    const { DrizzleExamSessionRepository } = await import("./exam-session-repository");
    const space = await new DrizzleSpaceRepository(db).create({ name: "Bio", description: null });
    const c = await newContent(db);
    const set = await new DrizzleStudySetRepository(db).create({
      kind: "exam",
      contentId: null,
      spaceId: space.id,
      title: "Exam 1",
      options: {},
    });
    const [q] = await new DrizzleQuizRepository(db).addQuestions(set.id, [
      {
        idx: 0,
        type: "true_false",
        difficulty: "easy",
        prompt: "ATP stores energy.",
        choices: null,
        answer: { type: "true_false", value: true },
        explanation: "It does.",
        topic: "Cells",
        locator: null,
        contentId: c.id,
      },
    ]);
    expect(q?.contentId).toBe(c.id);

    const repo = new DrizzleExamSessionRepository(db);
    const t0 = new Date("2026-11-15T10:00:00Z");
    const first = await repo.start(set.id, t0, new Date("2026-11-15T10:30:00Z"));
    const second = await repo.start(
      set.id,
      new Date("2026-11-15T11:00:00Z"),
      new Date("2026-11-15T11:30:00Z"),
    );
    expect((await repo.listBySet(set.id)).map((s) => s.id)).toEqual([second.id, first.id]);
    await repo.submit(first.id, new Date("2026-11-15T10:20:00Z"), 0.75);
    expect(await repo.get(first.id)).toMatchObject({
      score: 0.75,
      submittedAt: new Date("2026-11-15T10:20:00Z"),
    });

    // Deleting the content keeps the exam question and clears its content id.
    const { contents } = await import("../schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(contents).where(eq(contents.id, c.id));
    expect((await new DrizzleQuizRepository(db).listQuestions(set.id))[0]?.contentId).toBeNull();
  });
});

describe("paragraph numbers (ADR-0019)", () => {
  it("fills a 1-based paragraph on text locators that have none", async () => {
    const c = await newContent(db);
    const repo = new DrizzleSegmentRepository(db);
    await repo.replaceForContent(c.id, [
      { idx: 0, text: "First.", locator: { type: "offset", start: 0, end: 6 } },
      { idx: 1, text: "Second.", locator: { type: "offset", start: 8, end: 15, paragraph: 7 } },
    ]);
    const [a, b] = await repo.listByContent(c.id);
    expect(a?.locator).toEqual({ type: "offset", start: 0, end: 6, paragraph: 1 });
    expect(b?.locator).toMatchObject({ paragraph: 7 });
  });
});

describe("activity log (ADR-0023)", () => {
  it("records, throttles note edits, and counts by local day", async () => {
    const { DrizzleActivityRepository } = await import("./activity-repository");
    const repo = new DrizzleActivityRepository(db);
    // 23:30 UTC on Nov 14 is Nov 15 06:30 in UTC+7 (offset -420).
    const lateUtc = new Date("2026-11-14T23:30:00Z");
    await repo.record("quiz_answer", "q1", lateUtc);
    await repo.record("card_review", "c1", new Date("2026-11-15T03:00:00Z"));
    await repo.recordThrottled("note_edit", "n1", new Date("2026-11-15T04:00:00Z"), 3_600_000);
    await repo.recordThrottled("note_edit", "n1", new Date("2026-11-15T04:30:00Z"), 3_600_000);
    const from = new Date("2026-11-01T00:00:00Z");
    const to = new Date("2026-11-30T00:00:00Z");
    expect(await repo.countByDay(from, to, -420)).toEqual([{ day: "2026-11-15", count: 3 }]);
    expect(await repo.countByDay(from, to, 0)).toEqual([
      { day: "2026-11-14", count: 1 },
      { day: "2026-11-15", count: 2 },
    ]);
  });
});
