import type { z } from "zod";
import type { Chapter, Content, Segment } from "../../domain/content";
import type {
  Flashcard,
  FsrsState,
  NewFlashcard,
  Review,
  ReviewRating,
} from "../../domain/flashcard";
import { newFsrsState } from "../../domain/flashcard";
import type { NewQuizAttempt, NewQuizQuestion, QuizAttempt, QuizQuestion } from "../../domain/quiz";
import type { NewStudySet, StudySet, StudySetKind } from "../../domain/study-set";
import type { LlmProvider, LlmRequest } from "../../ports/llm";
import type {
  ChapterRepository,
  ContentRepository,
  FlashcardRepository,
  QuizRepository,
  SegmentRepository,
  StudySetRepository,
} from "../../ports/repositories";
import {
  type ChapterId,
  type ContentId,
  type FlashcardId,
  newId,
  type QuizAttemptId,
  type QuizQuestionId,
  type ReviewId,
  type SegmentId,
  type StudySetId,
} from "../../shared/id";
import { appError, err, ok } from "../../shared/result";

/** In-memory ports and a scripted model, shared by the quiz and flashcard tests. */

export class FakeLlm implements LlmProvider {
  readonly id = "fake" as const;
  requests: LlmRequest[] = [];
  constructor(private readonly reply: (req: LlmRequest) => unknown) {}
  async generateText() {
    return ok("");
  }
  async *streamText() {
    yield { type: "done" as const };
  }
  async generateObject<S extends z.ZodType>(req: LlmRequest, schema: S) {
    this.requests.push(req);
    const parsed = schema.safeParse(this.reply(req));
    return parsed.success
      ? ok(parsed.data as z.infer<S>)
      : err(appError("llm_bad_output", parsed.error.message));
  }
}

export class MemStudySets implements StudySetRepository {
  rows: StudySet[] = [];
  async create(input: NewStudySet) {
    const now = new Date(2026, 0, 1, 0, 0, this.rows.length);
    const s: StudySet = {
      id: newId<StudySetId>(),
      body: null,
      status: "ready",
      error: null,
      ...input,
      createdAt: now,
      updatedAt: now,
    } as StudySet;
    this.rows.push(s);
    return s;
  }
  async get(id: StudySetId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listByContent(contentId: ContentId, kind?: StudySetKind) {
    return this.rows.filter((r) => r.contentId === contentId && (!kind || r.kind === kind));
  }
  async listBySpace() {
    return [];
  }
  async update(id: StudySetId, patch: Partial<StudySet>) {
    const i = this.rows.findIndex((r) => r.id === id);
    const cur = this.rows[i];
    if (cur) this.rows[i] = { ...cur, ...patch };
  }
  async delete(id: StudySetId) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

export class MemQuizzes implements QuizRepository {
  questions: QuizQuestion[] = [];
  attempts: QuizAttempt[] = [];
  async addQuestions(setId: StudySetId, qs: NewQuizQuestion[]) {
    const rows = qs.map((q) => ({ ...q, id: newId<QuizQuestionId>(), setId }));
    this.questions.push(...rows);
    return rows;
  }
  async listQuestions(setId: StudySetId) {
    return this.questions.filter((q) => q.setId === setId);
  }
  async getQuestion(id: QuizQuestionId) {
    return this.questions.find((q) => q.id === id) ?? null;
  }
  async addAttempt(a: NewQuizAttempt) {
    const row = {
      ...a,
      id: newId<QuizAttemptId>(),
      createdAt: new Date(2026, 0, 1, 0, 0, this.attempts.length),
    };
    this.attempts.push(row);
    return row;
  }
  async listAttempts(setId: StudySetId) {
    const ids = new Set(this.questions.filter((q) => q.setId === setId).map((q) => q.id));
    return this.attempts.filter((a) => ids.has(a.questionId));
  }
}

export class MemFlashcards implements FlashcardRepository {
  cards: Flashcard[] = [];
  reviews: Review[] = [];
  async addCards(setId: StudySetId, cs: NewFlashcard[], now: Date) {
    const rows = cs.map((c) => ({
      ...c,
      id: newId<FlashcardId>(),
      setId,
      fsrs: newFsrsState(now),
    }));
    this.cards.push(...rows);
    return rows;
  }
  async listBySet(setId: StudySetId) {
    return this.cards.filter((c) => c.setId === setId);
  }
  async get(id: FlashcardId) {
    return this.cards.find((c) => c.id === id) ?? null;
  }
  async update(id: FlashcardId, patch: Partial<Pick<Flashcard, "front" | "back">>) {
    this.cards = this.cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
  }
  async delete(id: FlashcardId) {
    this.cards = this.cards.filter((c) => c.id !== id);
  }
  async listDue(now: Date, limit: number) {
    return this.cards
      .filter((c) => c.fsrs.due.getTime() <= now.getTime())
      .sort((a, b) => a.fsrs.due.getTime() - b.fsrs.due.getTime())
      .slice(0, limit);
  }
  async recordReview(id: FlashcardId, rating: ReviewRating, next: FsrsState, at: Date) {
    this.cards = this.cards.map((c) => (c.id === id ? { ...c, fsrs: next } : c));
    const r: Review = { id: newId<ReviewId>(), cardId: id, rating, reviewedAt: at };
    this.reviews.push(r);
    return r;
  }
}

export const CONTENT_ID = "c1" as ContentId;

export function fakeContent(status: Content["status"] = "ready"): ContentRepository {
  const content: Content = {
    id: CONTENT_ID,
    spaceId: null,
    kind: "pdf",
    title: "Cell energy",
    sourceUrl: null,
    filePath: null,
    status,
    error: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  return {
    create: async () => content,
    get: async (id: ContentId) => (id === content.id ? content : null),
    listRecent: async () => [content],
    listBySpace: async () => [content],
    setStatus: async () => {},
    setTitle: async () => {},
  };
}

export const pageChapters: Chapter[] = [
  {
    id: "ch1" as ChapterId,
    contentId: CONTENT_ID,
    idx: 0,
    title: "ATP",
    summary: "",
    locator: { type: "page", page: 1 },
  },
  {
    id: "ch2" as ChapterId,
    contentId: CONTENT_ID,
    idx: 1,
    title: "Krebs cycle",
    summary: "",
    locator: { type: "page", page: 3 },
  },
];

export const pageSegments: Segment[] = [1, 2, 3, 4].map((p, i) => ({
  id: `s${p}` as SegmentId,
  contentId: CONTENT_ID,
  idx: i,
  text: `Text of page ${p}.`,
  locator: { type: "page", page: p },
}));

export const fakeChapters = (chapters: Chapter[] = pageChapters): ChapterRepository => ({
  replaceForContent: async () => {},
  listByContent: async () => chapters,
});

export const fakeSegments = (segments: Segment[] = pageSegments): SegmentRepository => ({
  replaceForContent: async () => {},
  listByContent: async () => segments,
  search: async () => [],
});
