import {
  type AccentColor,
  accentColors,
  type ContentId,
  newId,
  type Tag,
  type TagId,
  type TagRepository,
} from "@thoth/core";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { contentTags, tags } from "../schema";

const toDomain = (r: typeof tags.$inferSelect): Tag => ({
  id: r.id as TagId,
  name: r.name,
  color: (accentColors as readonly string[]).includes(r.color) ? (r.color as AccentColor) : "gray",
});

export class DrizzleTagRepository implements TagRepository {
  constructor(private readonly db: Db) {}

  async create(name: string, color: AccentColor) {
    const [row] = await this.db
      .insert(tags)
      .values({ id: newId<TagId>(), name, color })
      .returning();
    if (!row) throw new Error("Insert into tags returned no row.");
    return toDomain(row);
  }

  async list() {
    return (await this.db.select().from(tags).orderBy(asc(tags.name))).map(toDomain);
  }

  async rename(id: TagId, name: string, color: AccentColor) {
    await this.db.update(tags).set({ name, color }).where(eq(tags.id, id));
  }

  async delete(id: TagId) {
    await this.db.delete(tags).where(eq(tags.id, id));
  }

  async setForContent(contentId: ContentId, tagIds: TagId[]) {
    await this.db.transaction(async (tx) => {
      await tx.delete(contentTags).where(eq(contentTags.contentId, contentId));
      const unique = [...new Set(tagIds)];
      if (unique.length)
        await tx.insert(contentTags).values(unique.map((tagId) => ({ contentId, tagId })));
    });
  }

  async listForContent(contentId: ContentId) {
    const rows = await this.db
      .select({ tag: tags })
      .from(contentTags)
      .innerJoin(tags, eq(tags.id, contentTags.tagId))
      .where(eq(contentTags.contentId, contentId))
      .orderBy(asc(tags.name));
    return rows.map((r) => toDomain(r.tag));
  }

  async listAssignments() {
    const rows = await this.db.select().from(contentTags);
    return rows.map((r) => ({ contentId: r.contentId as ContentId, tagId: r.tagId as TagId }));
  }
}
