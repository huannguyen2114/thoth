import {
  type Annotation,
  type AnnotationColor,
  type AnnotationId,
  type AnnotationRepository,
  annotationColors,
  annotationPayloadSchema,
  type ContentId,
  type Locator,
  type NewAnnotation,
  newId,
} from "@thoth/core";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { annotations } from "../schema";

type Row = typeof annotations.$inferSelect;

/** Reading-order sort key: page, start second, or paragraph number. */
export const positionOf = (locator: Locator | null): number => {
  if (!locator) return 0;
  switch (locator.type) {
    case "page":
      return locator.page;
    case "time":
      return locator.startSec;
    case "offset":
      return locator.paragraph ?? 0;
  }
};

const toDomain = (r: Row): Annotation => {
  const payload = r.payload ? annotationPayloadSchema.safeParse(r.payload) : null;
  return {
    id: r.id as AnnotationId,
    contentId: r.contentId as ContentId,
    kind: r.kind,
    anchor: r.anchor as unknown as Annotation["anchor"],
    color: (annotationColors as readonly string[]).includes(r.color)
      ? (r.color as AnnotationColor)
      : "yellow",
    comment: r.comment,
    payload: payload?.success ? payload.data : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
};

export class DrizzleAnnotationRepository implements AnnotationRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewAnnotation) {
    const [row] = await this.db
      .insert(annotations)
      .values({
        id: newId<AnnotationId>(),
        contentId: input.contentId,
        kind: input.kind,
        anchor: input.anchor as unknown as Record<string, unknown>,
        position: positionOf(input.anchor.locator),
        color: input.color,
        comment: input.comment,
        payload: input.payload as Record<string, unknown> | null,
      })
      .returning();
    if (!row) throw new Error("Insert into annotations returned no row.");
    return toDomain(row);
  }

  async get(id: AnnotationId) {
    const row = await this.db.query.annotations.findFirst({ where: eq(annotations.id, id) });
    return row ? toDomain(row) : null;
  }

  async listByContent(contentId: ContentId) {
    const rows = await this.db
      .select()
      .from(annotations)
      .where(eq(annotations.contentId, contentId))
      .orderBy(asc(annotations.position), asc(annotations.createdAt));
    return rows.map(toDomain);
  }

  async update(
    id: AnnotationId,
    patch: Partial<Pick<Annotation, "color" | "comment" | "payload" | "anchor">>,
  ) {
    const set: Partial<typeof annotations.$inferInsert> = {};
    if (patch.color !== undefined) set.color = patch.color;
    if (patch.comment !== undefined) set.comment = patch.comment;
    if (patch.payload !== undefined) set.payload = patch.payload as Record<string, unknown> | null;
    if (patch.anchor !== undefined) {
      set.anchor = patch.anchor as unknown as Record<string, unknown>;
      set.position = positionOf(patch.anchor.locator);
    }
    if (Object.keys(set).length === 0) return;
    await this.db
      .update(annotations)
      .set({ ...set, updatedAt: sql`(unixepoch('subsec') * 1000)` })
      .where(eq(annotations.id, id));
  }

  async delete(id: AnnotationId) {
    await this.db.delete(annotations).where(eq(annotations.id, id));
  }
}
