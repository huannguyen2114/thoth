import {
  type ContentId,
  type NewSegment,
  newId,
  type Segment,
  type SegmentHit,
  type SegmentId,
  type SegmentRepository,
} from "@thoth/core";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { segments } from "../schema";

type Row = typeof segments.$inferSelect;
/**
 * Text segments are paragraphs: fill the 1-based paragraph number from the position when the
 * stored locator has none, so every text locator can be cited as `[§n]` (ADR-0019).
 */
const toDomain = (r: Row): Segment => ({
  ...r,
  id: r.id as SegmentId,
  contentId: r.contentId as ContentId,
  locator:
    r.locator.type === "offset" && r.locator.paragraph === undefined
      ? { ...r.locator, paragraph: r.idx + 1 }
      : r.locator,
});

/** Turns free text into a safe FTS5 query: quoted terms joined by OR. */
export function toFtsQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((t) => t.length > 1);
  return terms ? terms.map((t) => `"${t}"`).join(" OR ") : "";
}

export class DrizzleSegmentRepository implements SegmentRepository {
  constructor(private readonly db: Db) {}

  async replaceForContent(contentId: ContentId, items: NewSegment[]) {
    await this.db.transaction(async (tx) => {
      await tx.run(sql`DELETE FROM chunks_fts WHERE content_id = ${contentId}`);
      await tx.delete(segments).where(eq(segments.contentId, contentId));
      for (const s of items) {
        const id = newId<SegmentId>();
        await tx.insert(segments).values({ id, contentId, ...s });
        await tx.run(
          sql`INSERT INTO chunks_fts (text, segment_id, content_id) VALUES (${s.text}, ${id}, ${contentId})`,
        );
      }
    });
  }

  async listByContent(contentId: ContentId) {
    const rows = await this.db
      .select()
      .from(segments)
      .where(eq(segments.contentId, contentId))
      .orderBy(asc(segments.idx));
    return rows.map(toDomain);
  }

  async search(contentIds: ContentId[], query: string, limit: number): Promise<SegmentHit[]> {
    const match = toFtsQuery(query);
    if (!match || contentIds.length === 0) return [];
    const ids = sql.join(
      contentIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const hits = await this.db.all<{ segment_id: string; rank: number }>(
      sql`SELECT segment_id, rank FROM chunks_fts
          WHERE chunks_fts MATCH ${match} AND content_id IN (${ids})
          ORDER BY rank LIMIT ${limit}`,
    );
    if (hits.length === 0) return [];
    const rows = await this.db.query.segments.findMany({
      where: (s, { inArray }) =>
        inArray(
          s.id,
          hits.map((h) => h.segment_id),
        ),
    });
    const byId = new Map(rows.map((r) => [r.id, toDomain(r)]));
    return hits.flatMap((h) => {
      const segment = byId.get(h.segment_id);
      return segment ? [{ segment, rank: h.rank }] : [];
    });
  }
}
