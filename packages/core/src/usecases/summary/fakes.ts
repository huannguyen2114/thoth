import type { Content, Segment } from "../../domain/content";
import type { Note } from "../../domain/note";
import type { StudySet } from "../../domain/study-set";
import type { LlmProvider, LlmRequest, LlmStreamEvent } from "../../ports/llm";
import type {
  ContentRepository,
  NoteRepository,
  SegmentRepository,
  StudySetRepository,
} from "../../ports/repositories";
import {
  type ContentId,
  newId,
  type SegmentId,
  type SpaceId,
  type StudySetId,
} from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";

/** In-memory fakes shared by the summary and notes tests. Test-only. */
export const CONTENT_ID = "c1" as ContentId;

export const contentRow = (status: Content["status"] = "ready"): Content => ({
  id: CONTENT_ID,
  spaceId: null as SpaceId | null,
  kind: "youtube",
  title: "Lecture",
  sourceUrl: null,
  filePath: null,
  status,
  error: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

export const seg = (idx: number, text: string, locator: Segment["locator"]): Segment => ({
  id: `s${idx}` as SegmentId,
  contentId: CONTENT_ID,
  idx,
  text,
  locator,
});

export const timeSegments = (): Segment[] => [
  seg(0, "Intro", { type: "time", startSec: 0, endSec: 42 }),
  seg(1, "Setup", { type: "time", startSec: 42, endSec: 106 }),
  seg(2, "Core idea", { type: "time", startSec: 106, endSec: 600 }),
  seg(3, "Case study", { type: "time", startSec: 600, endSec: 1702 }),
  seg(4, "Wrap up", { type: "time", startSec: 1702, endSec: 2000 }),
];

export const pageSegments = (): Segment[] =>
  [1, 2, 3, 4, 5, 6].map((p) => seg(p - 1, `Page ${p} text`, { type: "page", page: p }));

export class FakeContents implements ContentRepository {
  constructor(public row: Content | null = contentRow()) {}
  async create(): Promise<Content> {
    throw new Error("unused");
  }
  async get() {
    return this.row;
  }
  async listRecent() {
    return [];
  }
  async listBySpace() {
    return [];
  }
  async setStatus() {}
  async setTitle() {}
  async setSpace() {}
}

export class FakeSegments implements SegmentRepository {
  constructor(public rows: Segment[]) {}
  async replaceForContent() {}
  async listByContent() {
    return this.rows;
  }
  async search() {
    return [];
  }
}

export class FakeStudySets implements StudySetRepository {
  rows: StudySet[] = [];
  /** Every status the rows went through, for transition assertions. */
  history: string[] = [];
  async create(input: Parameters<StudySetRepository["create"]>[0]) {
    const now = new Date();
    const s: StudySet = {
      id: newId<StudySetId>(),
      kind: input.kind,
      contentId: input.contentId,
      spaceId: input.spaceId,
      title: input.title,
      options: input.options,
      body: input.body ?? null,
      status: input.status ?? "ready",
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(s);
    this.history.push(s.status);
    return s;
  }
  async get(id: StudySetId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listByContent(contentId: ContentId) {
    return this.rows.filter((r) => r.contentId === contentId);
  }
  async listBySpace() {
    return [];
  }
  async update(id: StudySetId, patch: Parameters<StudySetRepository["update"]>[1]) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    Object.assign(row, patch, { updatedAt: new Date() });
    if (patch.status) this.history.push(patch.status);
  }
  async delete(id: StudySetId) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

export class FakeNotes implements NoteRepository {
  saved: Note | null = null;
  async get() {
    return this.saved;
  }
  async save(contentId: ContentId, markdown: string) {
    this.saved = { contentId, markdown, updatedAt: new Date() };
    return this.saved;
  }
}

/** Streams the given chunks, then "done" (or an error event). Records every request. */
export class FakeLlm implements LlmProvider {
  readonly id = "fake" as const;
  requests: LlmRequest[] = [];
  constructor(
    private chunks: string[] = ["# Title\n", "A point [01:46]."],
    private failWith: string | null = null,
    private textResult: Result<string> | null = null,
  ) {}
  async generateText(req: LlmRequest): Promise<Result<string>> {
    this.requests.push(req);
    return this.textResult ?? ok(this.chunks.join(""));
  }
  async *streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    this.requests.push(req);
    for (const delta of this.chunks) yield { type: "text", delta };
    if (this.failWith) yield { type: "error", message: this.failWith };
    else yield { type: "done" };
  }
  async generateObject(): Promise<Result<never>> {
    return err(appError("llm_bad_output", "unused"));
  }
}
