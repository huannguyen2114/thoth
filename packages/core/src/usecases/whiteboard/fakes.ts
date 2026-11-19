import type { ActivityKind } from "../../domain/activity";
import type { BoardElement, Whiteboard } from "../../domain/whiteboard";
import type { ActivityRepository, WhiteboardRepository } from "../../ports/repositories";
import { type ContentId, newId, type SpaceId, type WhiteboardId } from "../../shared/id";

/** In-memory whiteboards with the same compare-and-swap rule as the Drizzle repository. */
export class MemWhiteboards implements WhiteboardRepository {
  rows: Whiteboard[] = [];
  saves = 0;
  /** Runs once before the next save, to simulate someone saving in between. */
  beforeSave: (() => void) | null = null;

  async create(input: {
    contentId: ContentId | null;
    spaceId: SpaceId | null;
    title: string;
    elements: BoardElement[];
  }) {
    const now = new Date(2026, 0, 1, 0, 0, this.rows.length);
    const b: Whiteboard = {
      id: newId<WhiteboardId>(),
      ...input,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(b);
    return structuredClone(b);
  }
  async get(id: WhiteboardId) {
    const b = this.rows.find((r) => r.id === id);
    return b ? structuredClone(b) : null;
  }
  async listByContent(contentId: ContentId) {
    return this.rows.filter((r) => r.contentId === contentId).map((b) => structuredClone(b));
  }
  async listBySpace(spaceId: SpaceId) {
    return this.rows.filter((r) => r.spaceId === spaceId).map((b) => structuredClone(b));
  }
  async save(id: WhiteboardId, elements: BoardElement[], expectedVersion: number) {
    const hook = this.beforeSave;
    this.beforeSave = null;
    hook?.();
    this.saves += 1;
    const i = this.rows.findIndex((r) => r.id === id);
    const cur = this.rows[i];
    if (!cur || cur.version !== expectedVersion) return null;
    const next = { ...cur, elements: structuredClone(elements), version: cur.version + 1 };
    this.rows[i] = next;
    return structuredClone(next);
  }
  async rename(id: WhiteboardId, title: string) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, title } : r));
  }
  async delete(id: WhiteboardId) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  /** Bumps the stored version as if another tab had saved. */
  bump(id: WhiteboardId, elements?: BoardElement[]) {
    this.rows = this.rows.map((r) =>
      r.id === id ? { ...r, version: r.version + 1, elements: elements ?? r.elements } : r,
    );
  }
}

export class MemActivity implements ActivityRepository {
  events: { kind: ActivityKind; ref: string | null }[] = [];
  async record(kind: ActivityKind, ref: string | null) {
    this.events.push({ kind, ref });
  }
  async recordThrottled(kind: ActivityKind, ref: string, at: Date, windowMs: number) {
    void at;
    void windowMs;
    if (!this.events.some((e) => e.kind === kind && e.ref === ref)) this.events.push({ kind, ref });
  }
  async countByDay() {
    return [];
  }
  async listRecent() {
    return [];
  }
}

export const shape = (id: string, x: number, y: number, extra: Partial<BoardElement> = {}) =>
  ({
    id,
    type: "shape",
    by: "person",
    kind: "rounded",
    color: "green",
    text: id,
    size: "body",
    x,
    y,
    w: 160,
    h: 64,
    ...extra,
  }) as BoardElement;
