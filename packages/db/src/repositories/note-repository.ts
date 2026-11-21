import {
  type ContentId,
  type Note,
  type NoteId,
  type NoteOwner,
  type NoteRepository,
  newId,
  type SpaceId,
} from "@thoth/core";
import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { notes } from "../schema";

const toDomain = (r: typeof notes.$inferSelect): Note => ({
  ...r,
  id: r.id as NoteId,
  contentId: r.contentId as ContentId | null,
  spaceId: r.spaceId as SpaceId | null,
});

const whereOwner = (owner: NoteOwner) =>
  "contentId" in owner ? eq(notes.contentId, owner.contentId) : eq(notes.spaceId, owner.spaceId);

export class DrizzleNoteRepository implements NoteRepository {
  constructor(private readonly db: Db) {}

  async get(owner: NoteOwner) {
    const row = await this.db.query.notes.findFirst({ where: whereOwner(owner) });
    return row ? toDomain(row) : null;
  }

  async save(owner: NoteOwner, markdown: string) {
    const byContent = "contentId" in owner;
    const [row] = await this.db
      .insert(notes)
      .values({
        id: newId<NoteId>(),
        contentId: byContent ? owner.contentId : null,
        spaceId: byContent ? null : owner.spaceId,
        markdown,
      })
      .onConflictDoUpdate({
        target: byContent ? notes.contentId : notes.spaceId,
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
