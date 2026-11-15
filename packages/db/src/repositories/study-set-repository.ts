import {
  type ContentId,
  type NewStudySet,
  newId,
  type SpaceId,
  type StudySet,
  type StudySetId,
  type StudySetKind,
  type StudySetRepository,
} from "@thoth/core";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { studySets } from "../schema";

const toDomain = (r: typeof studySets.$inferSelect): StudySet => ({
  ...r,
  id: r.id as StudySetId,
  contentId: r.contentId as ContentId | null,
  spaceId: r.spaceId as SpaceId | null,
});

export class DrizzleStudySetRepository implements StudySetRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewStudySet) {
    if ((input.contentId === null) === (input.spaceId === null)) {
      throw new Error("A study set belongs to exactly one of contentId or spaceId.");
    }
    const [row] = await this.db
      .insert(studySets)
      .values({
        id: newId<StudySetId>(),
        ...input,
        body: input.body ?? null,
        status: input.status ?? "ready",
      })
      .returning();
    if (!row) throw new Error("Insert into study_sets returned no row.");
    return toDomain(row);
  }

  async get(id: StudySetId) {
    const row = await this.db.query.studySets.findFirst({ where: eq(studySets.id, id) });
    return row ? toDomain(row) : null;
  }

  async listByContent(contentId: ContentId, kind?: StudySetKind) {
    const rows = await this.db
      .select()
      .from(studySets)
      .where(
        kind
          ? and(eq(studySets.contentId, contentId), eq(studySets.kind, kind))
          : eq(studySets.contentId, contentId),
      )
      .orderBy(desc(studySets.createdAt));
    return rows.map(toDomain);
  }

  async listBySpace(spaceId: SpaceId, kind?: StudySetKind) {
    const rows = await this.db
      .select()
      .from(studySets)
      .where(
        kind
          ? and(eq(studySets.spaceId, spaceId), eq(studySets.kind, kind))
          : eq(studySets.spaceId, spaceId),
      )
      .orderBy(desc(studySets.createdAt));
    return rows.map(toDomain);
  }

  async update(
    id: StudySetId,
    patch: Partial<Pick<StudySet, "title" | "body" | "status" | "error">>,
  ) {
    await this.db
      .update(studySets)
      .set({ ...patch, updatedAt: sql`(unixepoch('subsec') * 1000)` })
      .where(eq(studySets.id, id));
  }

  async delete(id: StudySetId) {
    await this.db.delete(studySets).where(eq(studySets.id, id));
  }
}
