import type { ContentId, Segment, SegmentId, VectorHit, VectorRepository } from "@thoth/core";
import { sql } from "drizzle-orm";
import type { Db } from "../client";
import { DrizzleSegmentRepository } from "./segment-repository";

/** libSQL native vectors (ADR-0029). Raw SQL: Drizzle has no F32_BLOB type. */
export class DrizzleVectorRepository implements VectorRepository {
  constructor(private readonly db: Db) {}

  async upsert(
    model: string,
    items: { segmentId: SegmentId; contentId: ContentId; vector: number[] }[],
  ) {
    if (items.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const it of items) {
        await tx.run(sql`
          INSERT INTO segment_vectors (segment_id, content_id, model, embedding)
          VALUES (${it.segmentId}, ${it.contentId}, ${model}, vector32(${JSON.stringify(it.vector)}))
          ON CONFLICT(segment_id) DO UPDATE SET
            model = excluded.model, embedding = excluded.embedding, content_id = excluded.content_id`);
      }
    });
  }

  async search(contentIds: ContentId[], vector: number[], k: number): Promise<VectorHit[]> {
    if (contentIds.length === 0 || k <= 0) return [];
    const ids = sql.join(
      contentIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const q = JSON.stringify(vector);
    // vector_top_k scans the ANN index globally; over-fetch, then keep the wanted contents.
    const rows = await this.db.all<{
      segment_id: string;
      content_id: string;
      distance: number;
    }>(sql`
      SELECT v.segment_id, v.content_id,
             vector_distance_cos(v.embedding, vector32(${q})) AS distance
      FROM vector_top_k('segment_vectors_ann_idx', vector32(${q}), ${Math.max(k * 8, 64)}) AS t
      JOIN segment_vectors AS v ON v.rowid = t.id
      WHERE v.content_id IN (${ids})
      ORDER BY distance
      LIMIT ${k}`);
    return rows.map((r) => ({
      segmentId: r.segment_id as SegmentId,
      contentId: r.content_id as ContentId,
      distance: Number(r.distance),
    }));
  }

  async missingSegments(model: string, limit: number): Promise<Segment[]> {
    const rows = await this.db.all<{ id: string }>(sql`
      SELECT s.id FROM segments AS s
      LEFT JOIN segment_vectors AS v ON v.segment_id = s.id AND v.model = ${model}
      WHERE v.segment_id IS NULL
      ORDER BY s.content_id, s.idx
      LIMIT ${limit}`);
    if (rows.length === 0) return [];
    const wanted = new Set(rows.map((r) => r.id));
    const byContent = new Map<string, Segment[]>();
    const segs = new DrizzleSegmentRepository(this.db);
    const contentIds = await this.db.all<{ content_id: string }>(sql`
      SELECT DISTINCT content_id FROM segments WHERE id IN (${sql.join(
        rows.map((r) => sql`${r.id}`),
        sql`, `,
      )})`);
    for (const { content_id } of contentIds) {
      byContent.set(content_id, await segs.listByContent(content_id as ContentId));
    }
    return [...byContent.values()].flat().filter((s) => wanted.has(s.id));
  }

  async deleteForContent(contentId: ContentId) {
    await this.db.run(sql`DELETE FROM segment_vectors WHERE content_id = ${contentId}`);
  }
}
