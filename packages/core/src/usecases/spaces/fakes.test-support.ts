import type { ActivityEvent, ActivityKind } from "../../domain/activity";
import type { Chat, ChatMessage } from "../../domain/chat";
import type {
  Content,
  ContentKind,
  ContentStatus,
  NewContent,
  NewSegment,
  Segment,
} from "../../domain/content";
import type { ExamSession } from "../../domain/exam";
import type { NewStudyPlan, PlanItem, StudyPlan } from "../../domain/plan";
import type { NewSpace, Space, UpdateSpaceInput } from "../../domain/space";
import type { AccentColor, Tag } from "../../domain/tag";
import type { LlmProvider, LlmRequest } from "../../ports/llm";
import type {
  ActivityRepository,
  ChatRepository,
  ContentRepository,
  ExamSessionRepository,
  LinkRecord,
  LinkRepository,
  LinkSourceKind,
  PlanRepository,
  SegmentRepository,
  SpaceRepository,
  TagRepository,
} from "../../ports/repositories";
import {
  type ChatId,
  type ContentId,
  type MessageId,
  newId,
  type PlanId,
  type SegmentId,
  type SpaceId,
  type StudySetId,
  type TagId,
} from "../../shared/id";
import { ok } from "../../shared/result";
import { MemFlashcards, MemQuizzes, MemStudySets } from "../quiz/fakes";

/** In-memory ports for the space, space-chat and dashboard tests (doc 22). */

export class MemSpaces implements SpaceRepository {
  rows: Space[] = [];
  async create(input: NewSpace) {
    const now = new Date(2026, 0, 1);
    const s: Space = { id: newId<SpaceId>(), ...input, createdAt: now, updatedAt: now };
    this.rows.push(s);
    return s;
  }
  async get(id: SpaceId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async list() {
    return this.rows;
  }
  async update(id: SpaceId, patch: UpdateSpaceInput) {
    this.rows = this.rows.map((r) =>
      r.id === id
        ? ({
            ...r,
            ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
          } as Space)
        : r,
    );
  }
}

export class MemContents implements ContentRepository {
  rows: Content[] = [];
  add(
    title: string,
    opts: {
      kind?: ContentKind;
      status?: ContentStatus;
      spaceId?: SpaceId | null;
      url?: string;
    } = {},
  ): Content {
    const now = new Date(2026, 0, 1, 0, this.rows.length);
    const c: Content = {
      id: newId<ContentId>(),
      spaceId: opts.spaceId ?? null,
      kind: opts.kind ?? "text",
      title,
      sourceUrl: opts.url ?? null,
      filePath: null,
      status: opts.status ?? "ready",
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(c);
    return c;
  }
  async create(input: NewContent) {
    const c = this.add(input.title, {
      kind: input.kind,
      status: "pending",
      spaceId: input.spaceId,
      ...(input.sourceUrl ? { url: input.sourceUrl } : {}),
    });
    return c;
  }
  async get(id: ContentId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listRecent(limit: number) {
    return [...this.rows].reverse().slice(0, limit);
  }
  async listBySpace(spaceId: SpaceId) {
    return this.rows.filter((r) => r.spaceId === spaceId);
  }
  async setStatus(id: ContentId, status: ContentStatus) {
    const c = this.rows.find((r) => r.id === id);
    if (c) c.status = status;
  }
  async setTitle() {}
  async setSpace(id: ContentId, spaceId: SpaceId | null) {
    const c = this.rows.find((r) => r.id === id);
    if (c) c.spaceId = spaceId;
  }
}

export class MemSegments implements SegmentRepository {
  rows: Segment[] = [];
  /** Queries seen. `search` matches any word of 4+ letters: a tiny stand-in for FTS5. */
  searches: string[] = [];
  add(contentId: ContentId, texts: string[], locator: (i: number) => Segment["locator"]) {
    for (const [idx, text] of texts.entries()) {
      this.rows.push({ id: newId<SegmentId>(), contentId, idx, text, locator: locator(idx) });
    }
  }
  async replaceForContent(contentId: ContentId, segments: NewSegment[]) {
    this.rows = this.rows.filter((r) => r.contentId !== contentId);
    for (const s of segments) this.rows.push({ ...s, id: newId<SegmentId>(), contentId });
  }
  async listByContent(contentId: ContentId) {
    return this.rows.filter((r) => r.contentId === contentId).sort((a, b) => a.idx - b.idx);
  }
  async search(contentIds: ContentId[], query: string, limit: number) {
    this.searches.push(query);
    const words = query.toLowerCase().match(/\w+/g) ?? [];
    return this.rows
      .filter((r) => contentIds.includes(r.contentId))
      .filter((r) => words.some((w) => w.length > 3 && r.text.toLowerCase().includes(w)))
      .slice(0, limit)
      .map((segment, i) => ({ segment, rank: i }));
  }
}

export class MemChats implements ChatRepository {
  chats: Chat[] = [];
  messages: ChatMessage[] = [];
  private make(contentId: ContentId | null, spaceId: SpaceId | null, title: string): Chat {
    const now = new Date(2026, 0, 1, 0, 0, this.chats.length);
    const c: Chat = {
      id: newId<ChatId>(),
      contentId,
      spaceId,
      title,
      instructions: null,
      createdAt: now,
      updatedAt: now,
    };
    this.chats.unshift(c);
    return c;
  }
  async create(contentId: ContentId, title: string) {
    return this.make(contentId, null, title);
  }
  async createForSpace(spaceId: SpaceId, title: string) {
    return this.make(null, spaceId, title);
  }
  async listBySpace(spaceId: SpaceId) {
    return this.chats.filter((c) => c.spaceId === spaceId);
  }
  async get(id: ChatId) {
    return this.chats.find((c) => c.id === id) ?? null;
  }
  async listByContent(contentId: ContentId) {
    return this.chats.filter((c) => c.contentId === contentId);
  }
  async setInstructions(id: ChatId, instructions: string | null) {
    this.chats = this.chats.map((c) => (c.id === id ? { ...c, instructions } : c));
  }
  async addMessage(chatId: ChatId, role: ChatMessage["role"], text: string) {
    const m: ChatMessage = {
      id: newId<MessageId>(),
      chatId,
      role,
      text,
      citations: [],
      createdAt: new Date(),
    };
    this.messages.push(m);
    return m;
  }
  async listMessages(chatId: ChatId) {
    return this.messages.filter((m) => m.chatId === chatId);
  }
}

export class MemLinks implements LinkRepository {
  rows: LinkRecord[] = [];
  async replaceFrom(fromKind: LinkSourceKind, fromId: string, links: LinkRecord[]) {
    this.rows = [
      ...this.rows.filter((r) => !(r.fromKind === fromKind && r.fromId === fromId)),
      ...links,
    ];
  }
  async backlinksTo(contentId: ContentId) {
    return this.rows.filter((r) => r.anchor.kind === "content" && r.anchor.contentId === contentId);
  }
  async backlinksToAnnotation() {
    return [];
  }
}

export class MemTags implements TagRepository {
  rows: Tag[] = [];
  assignments: { contentId: ContentId; tagId: TagId }[] = [];
  async create(name: string, color: AccentColor) {
    const t: Tag = { id: newId<TagId>(), name, color };
    this.rows.push(t);
    return t;
  }
  async list() {
    return this.rows;
  }
  async rename(id: TagId, name: string, color: AccentColor) {
    this.rows = this.rows.map((t) => (t.id === id ? { ...t, name, color } : t));
  }
  async delete(id: TagId) {
    this.rows = this.rows.filter((t) => t.id !== id);
    this.assignments = this.assignments.filter((a) => a.tagId !== id);
  }
  async setForContent(contentId: ContentId, tagIds: TagId[]) {
    this.assignments = [
      ...this.assignments.filter((a) => a.contentId !== contentId),
      ...tagIds.map((tagId) => ({ contentId, tagId })),
    ];
  }
  async listForContent(contentId: ContentId) {
    const ids = new Set(
      this.assignments.filter((a) => a.contentId === contentId).map((a) => a.tagId),
    );
    return this.rows.filter((t) => ids.has(t.id));
  }
  async listAssignments() {
    return this.assignments;
  }
}

export class MemPlans implements PlanRepository {
  plans: StudyPlan[] = [];
  items: PlanItem[] = [];
  async create(p: NewStudyPlan) {
    const now = new Date(2026, 0, 1);
    const plan: StudyPlan = { ...p, id: newId<PlanId>(), createdAt: now, updatedAt: now };
    this.plans.push(plan);
    return plan;
  }
  async get(id: PlanId) {
    return this.plans.find((p) => p.id === id) ?? null;
  }
  async list() {
    return this.plans;
  }
  async update() {}
  async delete() {}
  async replaceOpenItems() {
    return [];
  }
  async listItems(planId: PlanId) {
    return this.items.filter((i) => i.planId === planId);
  }
  async listItemsForDay(day: string) {
    return this.items.filter((i) => i.day === day);
  }
  async setDone() {}
  async updateItem() {}
}

/** Activity that keeps events with times, so History (and the dashboard) can read them back. */
export class MemTimedActivity implements ActivityRepository {
  events: ActivityEvent[] = [];
  async record(kind: ActivityKind, ref: string | null, at: Date) {
    this.events.unshift({ id: newId<string>(), kind, ref, at });
  }
  async recordThrottled(kind: ActivityKind, ref: string, at: Date) {
    await this.record(kind, ref, at);
  }
  async countByDay() {
    return [];
  }
  async listRecent(limit: number) {
    return this.events.slice(0, limit);
  }
}

export class MemExamSessions implements ExamSessionRepository {
  async start(): Promise<ExamSession> {
    throw new Error("not used");
  }
  async get() {
    return null;
  }
  async listBySet(_: StudySetId) {
    return [];
  }
  async submit() {}
}

/** A streaming model that answers with a fixed text, and remembers each request. */
export class StreamLlm implements LlmProvider {
  readonly id = "fake" as const;
  requests: LlmRequest[] = [];
  constructor(private readonly reply: (req: LlmRequest) => string) {}
  async generateText() {
    return ok("");
  }
  async *streamText(req: LlmRequest) {
    this.requests.push(req);
    for (const chunk of this.reply(req).split(/(?<= )/))
      yield { type: "text" as const, delta: chunk };
    yield { type: "done" as const };
  }
  async generateObject(): Promise<never> {
    throw new Error("not used");
  }
}

export function world() {
  return {
    spaces: new MemSpaces(),
    contents: new MemContents(),
    segments: new MemSegments(),
    chats: new MemChats(),
    links: new MemLinks(),
    tags: new MemTags(),
    plans: new MemPlans(),
    activity: new MemTimedActivity(),
    examSessions: new MemExamSessions(),
    studySets: new MemStudySets(),
    quizzes: new MemQuizzes(),
    flashcards: new MemFlashcards(),
  };
}

export const para = (i: number): Segment["locator"] => ({
  type: "offset",
  start: i * 100,
  end: i * 100 + 99,
  paragraph: i + 1,
});
export const page = (i: number): Segment["locator"] => ({ type: "page", page: i + 1 });
