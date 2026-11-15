import {
  type Chapter,
  type ChapterId,
  type ChapterRepository,
  type ContentId,
  type NewChapter,
  newId,
} from "@thoth/core";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { chapters } from "../schema";

type Row = typeof chapters.$inferSelect;
const toDomain = (r: Row): Chapter => ({
  ...r,
  id: r.id as ChapterId,
  contentId: r.contentId as ContentId,
});

export class DrizzleChapterRepository implements ChapterRepository {
  constructor(private readonly db: Db) {}

  async replaceForContent(contentId: ContentId, items: NewChapter[]) {
    await this.db.transaction(async (tx) => {
      await tx.delete(chapters).where(eq(chapters.contentId, contentId));
      if (items.length > 0) {
        await tx
          .insert(chapters)
          .values(items.map((c) => ({ id: newId<ChapterId>(), contentId, ...c })));
      }
    });
  }

  async listByContent(contentId: ContentId) {
    const rows = await this.db
      .select()
      .from(chapters)
      .where(eq(chapters.contentId, contentId))
      .orderBy(asc(chapters.idx));
    return rows.map(toDomain);
  }
}
