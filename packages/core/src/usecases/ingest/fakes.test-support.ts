/**
 * In-memory fakes for ingest use-case tests. Not exported from the package.
 */
import type { z } from "zod";
import type {
  Chapter,
  Content,
  ContentStatus,
  NewChapter,
  NewContent,
  NewSegment,
  Segment,
} from "../../domain/content";
import type { Job, JobKind } from "../../domain/job";
import type { IngestFailure, IngestSource, ParsedSource, SourceParser } from "../../ports/ingest";
import type { LlmProvider, LlmRequest } from "../../ports/llm";
import type {
  ChapterRepository,
  ContentRepository,
  JobRepository,
  SegmentRepository,
} from "../../ports/repositories";
import {
  type ChapterId,
  type ContentId,
  type JobId,
  newId,
  type SegmentId,
  type SpaceId,
} from "../../shared/id";
import { type AppError, err, ok, type Result } from "../../shared/result";
import type { IngestDeps } from "./run-ingest-job";

export class InMemoryContents implements ContentRepository {
  rows: Content[] = [];
  async create(input: NewContent) {
    const now = new Date();
    const c: Content = {
      id: newId<ContentId>(),
      ...input,
      status: "pending",
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(c);
    return c;
  }
  async get(id: ContentId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listRecent(limit: number) {
    return [...this.rows].reverse().slice(0, limit);
  }
  async listBySpace() {
    return [];
  }
  async setStatus(id: ContentId, status: ContentStatus, error: string | null = null) {
    const c = this.rows.find((r) => r.id === id);
    if (c) Object.assign(c, { status, error });
  }
  async setTitle(id: ContentId, title: string) {
    const c = this.rows.find((r) => r.id === id);
    if (c) c.title = title;
  }

  async setSpace(id: ContentId, spaceId: SpaceId | null) {
    const c = this.rows.find((r) => r.id === id);
    if (c) c.spaceId = spaceId;
  }
}

export class InMemorySegments implements SegmentRepository {
  rows: Segment[] = [];
  async replaceForContent(contentId: ContentId, segments: NewSegment[]) {
    this.rows = this.rows.filter((r) => r.contentId !== contentId);
    for (const s of segments) this.rows.push({ ...s, id: newId<SegmentId>(), contentId });
  }
  async listByContent(contentId: ContentId) {
    return this.rows.filter((r) => r.contentId === contentId).sort((a, b) => a.idx - b.idx);
  }
  async search() {
    return [];
  }
}

export class InMemoryChapters implements ChapterRepository {
  rows: Chapter[] = [];
  async replaceForContent(contentId: ContentId, chapters: NewChapter[]) {
    this.rows = this.rows.filter((r) => r.contentId !== contentId);
    for (const c of chapters) this.rows.push({ ...c, id: newId<ChapterId>(), contentId });
  }
  async listByContent(contentId: ContentId) {
    return this.rows.filter((r) => r.contentId === contentId);
  }
}

export class InMemoryJobs implements JobRepository {
  rows: Job[] = [];
  async enqueue(kind: JobKind, payload: Record<string, unknown>, runAfter = new Date(0)) {
    const now = new Date();
    const j: Job = {
      id: newId<JobId>(),
      kind,
      payload,
      status: "queued",
      attempts: 0,
      error: null,
      runAfter,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(j);
    return j;
  }
  async claimNext(now: Date) {
    const j = this.rows.find((r) => r.status === "queued" && r.runAfter <= now);
    if (!j) return null;
    j.status = "running";
    j.attempts += 1;
    return { ...j };
  }
  async complete(id: JobId) {
    const j = this.rows.find((r) => r.id === id);
    if (j) Object.assign(j, { status: "done", error: null });
  }
  async fail(id: JobId, error: string, retryAt: Date | null) {
    const j = this.rows.find((r) => r.id === id);
    if (!j) return;
    if (retryAt) Object.assign(j, { status: "queued", error, runAfter: retryAt });
    else Object.assign(j, { status: "failed", error });
  }
  async get(id: JobId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async requeueRunning() {
    const running = this.rows.filter((r) => r.status === "running");
    for (const r of running) r.status = "queued";
    return running.length;
  }
}

export class FakeParser implements SourceParser {
  calls: IngestSource[] = [];
  constructor(
    public result: (s: IngestSource) => Result<ParsedSource, IngestFailure> = () =>
      ok({
        title: "Parsed title",
        segments: [{ idx: 0, text: "Hello", locator: { type: "page", page: 1 } }],
      }),
  ) {}
  async parse(source: IngestSource) {
    this.calls.push(source);
    return this.result(source);
  }
}

/** Replies to generateObject with `reply(req)`, validated by the real schema. */
export class FakeLlm implements LlmProvider {
  readonly id = "fake" as const;
  requests: LlmRequest[] = [];
  constructor(public reply: (req: LlmRequest) => unknown | AppError) {}
  async generateText() {
    return ok("");
  }
  async *streamText() {
    yield { type: "done" as const };
  }
  async generateObject<S extends z.ZodType>(req: LlmRequest, schema: S) {
    this.requests.push(req);
    const raw = this.reply(req);
    if (raw && typeof raw === "object" && "code" in raw && "message" in raw) {
      return err(raw as AppError);
    }
    const parsed = schema.safeParse(raw);
    return parsed.success
      ? ok(parsed.data as z.infer<S>)
      : err({ code: "llm_bad_output", message: parsed.error.message } as AppError);
  }
}

export function makeDeps(overrides: Partial<{ parser: FakeParser; llm: FakeLlm }> = {}) {
  const deps = {
    contents: new InMemoryContents(),
    segments: new InMemorySegments(),
    chapters: new InMemoryChapters(),
    jobs: new InMemoryJobs(),
    parser: overrides.parser ?? new FakeParser(),
    llmFake:
      overrides.llm ??
      new FakeLlm(() => ({ chapters: [{ startSegment: 0, title: "Intro", summary: "Basics." }] })),
  };
  const ingest: IngestDeps = { ...deps, llm: async () => deps.llmFake };
  return { ...deps, ingest };
}
