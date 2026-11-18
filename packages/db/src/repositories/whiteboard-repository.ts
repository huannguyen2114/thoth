import {
  type BoardElement,
  type ContentId,
  newId,
  type SpaceId,
  type Whiteboard,
  type WhiteboardId,
  type WhiteboardRepository,
} from "@thoth/core";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { whiteboards } from "../schema";

const toDomain = (r: typeof whiteboards.$inferSelect): Whiteboard => ({
  ...r,
  id: r.id as WhiteboardId,
  contentId: r.contentId as ContentId | null,
  spaceId: r.spaceId as SpaceId | null,
  elements: r.elements as BoardElement[],
});

export class DrizzleWhiteboardRepository implements WhiteboardRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    contentId: ContentId | null;
    spaceId: SpaceId | null;
    title: string;
    elements: BoardElement[];
  }) {
    if ((input.contentId === null) === (input.spaceId === null)) {
      throw new Error("A whiteboard belongs to exactly one of contentId or spaceId.");
    }
    const [row] = await this.db
      .insert(whiteboards)
      .values({ id: newId<WhiteboardId>(), ...input })
      .returning();
    if (!row) throw new Error("Insert into whiteboards returned no row.");
    return toDomain(row);
  }

  async get(id: WhiteboardId) {
    const row = await this.db.query.whiteboards.findFirst({ where: eq(whiteboards.id, id) });
    return row ? toDomain(row) : null;
  }

  async listByContent(contentId: ContentId) {
    const rows = await this.db
      .select()
      .from(whiteboards)
      .where(eq(whiteboards.contentId, contentId))
      .orderBy(desc(whiteboards.updatedAt));
    return rows.map(toDomain);
  }

  async listBySpace(spaceId: SpaceId) {
    const rows = await this.db
      .select()
      .from(whiteboards)
      .where(eq(whiteboards.spaceId, spaceId))
      .orderBy(desc(whiteboards.updatedAt));
    return rows.map(toDomain);
  }

  async save(id: WhiteboardId, elements: BoardElement[], expectedVersion: number) {
    // Compare-and-swap on version: a concurrent save makes this update match no row.
    const [row] = await this.db
      .update(whiteboards)
      .set({
        elements,
        version: expectedVersion + 1,
        updatedAt: sql`(unixepoch('subsec') * 1000)`,
      })
      .where(and(eq(whiteboards.id, id), eq(whiteboards.version, expectedVersion)))
      .returning();
    return row ? toDomain(row) : null;
  }

  async rename(id: WhiteboardId, title: string) {
    await this.db.update(whiteboards).set({ title }).where(eq(whiteboards.id, id));
  }

  async delete(id: WhiteboardId) {
    await this.db.delete(whiteboards).where(eq(whiteboards.id, id));
  }
}
