import type { ContentId, Note, NoteRepository } from "@thoth/core";
import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { notes } from "../schema";

const toDomain = (r: typeof notes.$inferSelect): Note => ({
  ...r,
  contentId: r.contentId as ContentId,
});

export class DrizzleNoteRepository implements NoteRepository {
  constructor(private readonly db: Db) {}

  async get(contentId: ContentId) {
    const row = await this.db.query.notes.findFirst({ where: eq(notes.contentId, contentId) });
    return row ? toDomain(row) : null;
  }

  async save(contentId: ContentId, markdown: string) {
    const [row] = await this.db
      .insert(notes)
      .values({ contentId, markdown })
      .onConflictDoUpdate({
        target: notes.contentId,
        set: { markdown, updatedAt: sql`(unixepoch('subsec') * 1000)` },
      })
      .returning();
    if (!row) throw new Error("Upsert into notes returned no row.");
    return toDomain(row);
  }

  async list() {
    const rows = await this.db.select().from(notes).orderBy(desc(notes.updatedAt));
    return rows.filter((r) => r.markdown.trim().length > 0).map(toDomain);
  }
}
