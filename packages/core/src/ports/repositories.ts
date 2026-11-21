import type { ActivityDay, ActivityEvent, ActivityKind } from "../domain/activity";
import type { Annotation, NewAnnotation } from "../domain/annotation";
import type { Chat, ChatMessage } from "../domain/chat";
import type { CitationRef } from "../domain/citation";
import type {
  Chapter,
  Content,
  ContentStatus,
  NewChapter,
  NewContent,
  NewSegment,
  Segment,
  SegmentHit,
} from "../domain/content";
import type { ExamSession } from "../domain/exam";
import type { Flashcard, FsrsState, NewFlashcard, Review, ReviewRating } from "../domain/flashcard";
import type { Job, JobKind } from "../domain/job";
import type { SourceAnchor } from "../domain/link";
import type { LlmSettings } from "../domain/llm-settings";
import type { Note, NoteOwner } from "../domain/note";
import type { NewPlanItem, NewStudyPlan, PlanItem, StudyPlan } from "../domain/plan";
import type { NewQuizAttempt, NewQuizQuestion, QuizAttempt, QuizQuestion } from "../domain/quiz";
import type { NewSpace, Space, UpdateSpaceInput } from "../domain/space";
import type { NewStudySet, StudySet, StudySetKind } from "../domain/study-set";
import type { AccentColor, Tag } from "../domain/tag";
import type { BoardElement, Whiteboard } from "../domain/whiteboard";
import type {
  AnnotationId,
  ChatId,
  ContentId,
  ExamSessionId,
  FlashcardId,
  JobId,
  PlanId,
  PlanItemId,
  QuizQuestionId,
  SpaceId,
  StudySetId,
  TagId,
  WhiteboardId,
} from "../shared/id";

/**
 * Persistence ports. Implemented by @thoth/db. Use cases depend on these, never on Drizzle.
 * Contracts frozen for parallel lanes: change only via the orchestrator
 * (docs/plan/parallel-development.md).
 */
export interface SpaceRepository {
  create(input: NewSpace): Promise<Space>;
  get(id: SpaceId): Promise<Space | null>;
  list(): Promise<Space[]>;
  /** Changes only the fields given (Phase 10). */
  update(id: SpaceId, patch: UpdateSpaceInput): Promise<void>;
}

export interface ContentRepository {
  create(input: NewContent): Promise<Content>;
  get(id: ContentId): Promise<Content | null>;
  listRecent(limit: number): Promise<Content[]>;
  listBySpace(spaceId: SpaceId): Promise<Content[]>;
  setStatus(id: ContentId, status: ContentStatus, error?: string | null): Promise<void>;
  setTitle(id: ContentId, title: string): Promise<void>;
  /** Moves a content into a space, or out of any space with null (ADR-0018). */
  setSpace(id: ContentId, spaceId: SpaceId | null): Promise<void>;
}

export interface SegmentRepository {
  /** Replaces all segments (and their search index rows) of a content atomically. */
  replaceForContent(contentId: ContentId, segments: NewSegment[]): Promise<void>;
  listByContent(contentId: ContentId): Promise<Segment[]>;
  /** FTS5 BM25 search across the given contents. Empty query returns []. */
  search(contentIds: ContentId[], query: string, limit: number): Promise<SegmentHit[]>;
}

export interface ChapterRepository {
  replaceForContent(contentId: ContentId, chapters: NewChapter[]): Promise<void>;
  listByContent(contentId: ContentId): Promise<Chapter[]>;
}

export interface ChatRepository {
  create(contentId: ContentId, title: string): Promise<Chat>;
  /** A chat across a whole space (Phase 10). */
  createForSpace(spaceId: SpaceId, title: string): Promise<Chat>;
  listBySpace(spaceId: SpaceId): Promise<Chat[]>;
  get(id: ChatId): Promise<Chat | null>;
  listByContent(contentId: ContentId): Promise<Chat[]>;
  setInstructions(id: ChatId, instructions: string | null): Promise<void>;
  addMessage(
    chatId: ChatId,
    role: ChatMessage["role"],
    text: string,
    citations: CitationRef[],
  ): Promise<ChatMessage>;
  listMessages(chatId: ChatId): Promise<ChatMessage[]>;
}

export interface StudySetRepository {
  create(input: NewStudySet): Promise<StudySet>;
  get(id: StudySetId): Promise<StudySet | null>;
  listByContent(contentId: ContentId, kind?: StudySetKind): Promise<StudySet[]>;
  listBySpace(spaceId: SpaceId, kind?: StudySetKind): Promise<StudySet[]>;
  update(
    id: StudySetId,
    patch: Partial<Pick<StudySet, "title" | "body" | "status" | "error">>,
  ): Promise<void>;
  delete(id: StudySetId): Promise<void>;
}

export interface NoteRepository {
  /** The content's or space's notes (Phase 10 added spaces). */
  get(owner: NoteOwner): Promise<Note | null>;
  save(owner: NoteOwner, markdown: string): Promise<Note>;
  /** Every non-empty note, most recently edited first (search, export). */
  list(): Promise<Note[]>;
}

export interface QuizRepository {
  addQuestions(setId: StudySetId, questions: NewQuizQuestion[]): Promise<QuizQuestion[]>;
  listQuestions(setId: StudySetId): Promise<QuizQuestion[]>;
  getQuestion(id: QuizQuestionId): Promise<QuizQuestion | null>;
  addAttempt(attempt: NewQuizAttempt): Promise<QuizAttempt>;
  listAttempts(setId: StudySetId): Promise<QuizAttempt[]>;
}

export interface FlashcardRepository {
  addCards(setId: StudySetId, cards: NewFlashcard[], now: Date): Promise<Flashcard[]>;
  listBySet(setId: StudySetId): Promise<Flashcard[]>;
  get(id: FlashcardId): Promise<Flashcard | null>;
  update(id: FlashcardId, patch: Partial<Pick<Flashcard, "front" | "back">>): Promise<void>;
  delete(id: FlashcardId): Promise<void>;
  /** Cards with fsrs.due <= now, across all sets, oldest due first. */
  listDue(now: Date, limit: number): Promise<Flashcard[]>;
  /** Saves the new schedule and appends a review row in one transaction. */
  recordReview(id: FlashcardId, rating: ReviewRating, next: FsrsState, at: Date): Promise<Review>;
}

export interface ExamSessionRepository {
  start(setId: StudySetId, startedAt: Date, deadlineAt: Date): Promise<ExamSession>;
  get(id: ExamSessionId): Promise<ExamSession | null>;
  /** Newest first. */
  listBySet(setId: StudySetId): Promise<ExamSession[]>;
  submit(id: ExamSessionId, submittedAt: Date, score: number): Promise<void>;
}

export interface JobRepository {
  enqueue(kind: JobKind, payload: Record<string, unknown>, runAfter?: Date): Promise<Job>;
  /** Atomically marks the oldest runnable queued job as running and returns it. */
  claimNext(now: Date): Promise<Job | null>;
  complete(id: JobId): Promise<void>;
  fail(id: JobId, error: string, retryAt: Date | null): Promise<void>;
  get(id: JobId): Promise<Job | null>;
  /**
   * Puts jobs still marked `running` back in the queue. Called once when the runner starts:
   * in a single process, any `running` job at boot was cut off by a crash or restart.
   * Returns how many jobs were re-queued.
   */
  requeueRunning(): Promise<number>;
}

export interface SettingsRepository {
  /** Returns null when the owner has never saved LLM settings. */
  getLlmSettings(): Promise<LlmSettings | null>;
  saveLlmSettings(settings: LlmSettings): Promise<void>;
}

/** Habit tracker log (ADR-0023). Use cases record through this; recording never blocks them. */
export interface ActivityRepository {
  record(kind: ActivityKind, ref: string | null, at: Date): Promise<void>;
  /** Records unless the same kind + ref was recorded within `windowMs` before `at`. */
  recordThrottled(kind: ActivityKind, ref: string, at: Date, windowMs: number): Promise<void>;
  /**
   * Event counts per local day between `from` and `to` (inclusive), days without events
   * omitted. `tzOffsetMin` is the client's `Date#getTimezoneOffset()` (minutes behind UTC).
   */
  countByDay(from: Date, to: Date, tzOffsetMin: number): Promise<ActivityDay[]>;
  /** Newest first, for the History timeline. */
  listRecent(limit: number): Promise<ActivityEvent[]>;
}

/** Study planner (ADR-0030). */
export interface PlanRepository {
  create(plan: NewStudyPlan): Promise<StudyPlan>;
  get(id: PlanId): Promise<StudyPlan | null>;
  list(): Promise<StudyPlan[]>;
  update(id: PlanId, patch: Partial<NewStudyPlan>): Promise<void>;
  delete(id: PlanId): Promise<void>;
  /** Deletes the plan's items that are not done, then inserts `items` (re-planning keeps finished work). */
  replaceOpenItems(planId: PlanId, items: NewPlanItem[]): Promise<PlanItem[]>;
  listItems(planId: PlanId): Promise<PlanItem[]>;
  /** Items of every plan on one local day, in plan then idx order. */
  listItemsForDay(day: string): Promise<PlanItem[]>;
  setDone(itemId: PlanItemId, doneAt: Date | null): Promise<void>;
  updateItem(
    itemId: PlanItemId,
    patch: Partial<Pick<PlanItem, "title" | "minutes" | "day">>,
  ): Promise<void>;
}

/** Whiteboards (ADR-0031). */
export interface WhiteboardRepository {
  create(input: {
    contentId: ContentId | null;
    spaceId: SpaceId | null;
    title: string;
    elements: BoardElement[];
  }): Promise<Whiteboard>;
  get(id: WhiteboardId): Promise<Whiteboard | null>;
  listByContent(contentId: ContentId): Promise<Whiteboard[]>;
  listBySpace(spaceId: SpaceId): Promise<Whiteboard[]>;
  /**
   * Saves the whole element list if `expectedVersion` is current and returns the new board.
   * Returns null when someone saved in between (the caller reloads and re-applies).
   */
  save(
    id: WhiteboardId,
    elements: BoardElement[],
    expectedVersion: number,
  ): Promise<Whiteboard | null>;
  rename(id: WhiteboardId, title: string): Promise<void>;
  delete(id: WhiteboardId): Promise<void>;
}

/** Highlights, ink, shapes and comments on a source (Phase 10, doc 21). */
export interface AnnotationRepository {
  create(input: NewAnnotation): Promise<Annotation>;
  get(id: AnnotationId): Promise<Annotation | null>;
  /** In reading order: by page (or time / paragraph), then creation time. */
  listByContent(contentId: ContentId): Promise<Annotation[]>;
  update(
    id: AnnotationId,
    patch: Partial<Pick<Annotation, "color" | "comment" | "payload" | "anchor">>,
  ): Promise<void>;
  delete(id: AnnotationId): Promise<void>;
}

/** Where a link was written: a notes document, a chat message, or a whiteboard. */
export const linkSourceKinds = ["note", "chat_message", "board"] as const;
export type LinkSourceKind = (typeof linkSourceKinds)[number];

/** One row of the backlink index: "this note links to that spot". */
export interface LinkRecord {
  fromKind: LinkSourceKind;
  /** NoteId, MessageId or WhiteboardId. */
  fromId: string;
  /** Where the link was written, so a backlink can open it (null for a space's notes). */
  fromContentId: ContentId | null;
  fromSpaceId: SpaceId | null;
  label: string;
  anchor: SourceAnchor;
}

/**
 * The backlink index (Phase 10, doc 21). Derived data: the source of truth is the Markdown or
 * message text, re-parsed with `parseLinks` and written with `replaceFrom` on every save.
 */
export interface LinkRepository {
  /** Replaces every link written by one note, message or board. */
  replaceFrom(fromKind: LinkSourceKind, fromId: string, links: LinkRecord[]): Promise<void>;
  /** Links that point into a content: at it, at one of its annotations, or at one of its sets. */
  backlinksTo(contentId: ContentId): Promise<LinkRecord[]>;
  backlinksToAnnotation(annotationId: AnnotationId): Promise<LinkRecord[]>;
}

/** Content tags (Phase 10, doc 22). */
export interface TagRepository {
  create(name: string, color: AccentColor): Promise<Tag>;
  list(): Promise<Tag[]>;
  rename(id: TagId, name: string, color: AccentColor): Promise<void>;
  delete(id: TagId): Promise<void>;
  /** Replaces a content's tags. */
  setForContent(contentId: ContentId, tagIds: TagId[]): Promise<void>;
  listForContent(contentId: ContentId): Promise<Tag[]>;
  /** contentId → its tags, for every tagged content (library filters). */
  listAssignments(): Promise<{ contentId: ContentId; tagId: TagId }[]>;
}
