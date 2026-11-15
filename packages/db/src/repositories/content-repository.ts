import {
  type Content,
  type ContentId,
  type ContentRepository,
  type ContentStatus,
  type NewContent,
  newId,
  type SpaceId,
} from "@thoth/core";
import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { contents } from "../schema";

type Row = typeof contents.$inferSelect;
const toDomain = (r: Row): Content => ({
  ...r,
  id: r.id as ContentId,
  spaceId: r.spaceId as SpaceId | null,
});
const touch = { updatedAt: sql`(unixepoch('subsec') * 1000)` };

export class DrizzleContentRepository implements ContentRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewContent): Promise<Content> {
    const [row] = await this.db
      .insert(contents)
      .values({ id: newId<ContentId>(), ...input })
      .returning();
    if (!row) throw new Error("Insert into contents returned no row.");
    return toDomain(row);
  }

  async get(id: ContentId) {
    const row = await this.db.query.contents.findFirst({ where: eq(contents.id, id) });
    return row ? toDomain(row) : null;
  }

  async listRecent(limit: number) {
    const rows = await this.db
      .select()
      .from(contents)
      .orderBy(desc(contents.updatedAt))
      .limit(limit);
    return rows.map(toDomain);
  }

  async listBySpace(spaceId: SpaceId) {
    const rows = await this.db
      .select()
      .from(contents)
      .where(eq(contents.spaceId, spaceId))
      .orderBy(desc(contents.createdAt));
    return rows.map(toDomain);
  }

  async setStatus(id: ContentId, status: ContentStatus, error: string | null = null) {
    await this.db
      .update(contents)
      .set({ status, error, ...touch })
      .where(eq(contents.id, id));
  }

  async setTitle(id: ContentId, title: string) {
    await this.db
      .update(contents)
      .set({ title, ...touch })
      .where(eq(contents.id, id));
  }
}
