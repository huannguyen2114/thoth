import {
  type AnnotationId,
  type ContentId,
  type LinkId,
  type LinkRecord,
  type LinkRepository,
  type LinkSourceKind,
  newId,
  type SourceAnchor,
  type SpaceId,
  sourceAnchorSchema,
} from "@thoth/core";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../client";
import { annotations, links, studySets } from "../schema";

const toDomain = (r: typeof links.$inferSelect): LinkRecord | null => {
  const anchor = sourceAnchorSchema.safeParse(r.anchor);
  if (!anchor.success) return null;
  return {
    fromKind: r.fromKind,
    fromId: r.fromId,
    fromContentId: r.fromContentId as ContentId | null,
    fromSpaceId: r.fromSpaceId as SpaceId | null,
    label: r.label,
    anchor: anchor.data as SourceAnchor,
  };
};

/** Backlink index (doc 21). Resolves each anchor to the content it lands in when saved. */
export class DrizzleLinkRepository implements LinkRepository {
  constructor(private readonly db: Db) {}

  async replaceFrom(fromKind: LinkSourceKind, fromId: string, records: LinkRecord[]) {
    const annIds = records.flatMap((r) =>
      r.anchor.kind === "annotation" ? [r.anchor.annotationId] : [],
    );
    const setIds = records.flatMap((r) => (r.anchor.kind === "set" ? [r.anchor.setId] : []));
    const [anns, sets] = await Promise.all([
      annIds.length
        ? this.db
            .select({ id: annotations.id, contentId: annotations.contentId })
            .from(annotations)
            .where(inArray(annotations.id, annIds))
        : [],
      setIds.length
        ? this.db
            .select({ id: studySets.id, contentId: studySets.contentId })
            .from(studySets)
            .where(inArray(studySets.id, setIds))
        : [],
    ]);
    const annContent = new Map(anns.map((a) => [a.id, a.contentId]));
    const setContent = new Map(sets.map((s) => [s.id, s.contentId]));
    const rows = records.map((r) => {
      const a = r.anchor;
      return {
        id: newId<LinkId>(),
        fromKind,
        fromId,
        fromContentId: r.fromContentId,
        fromSpaceId: r.fromSpaceId,
        label: r.label,
        toContentId:
          a.kind === "content"
            ? a.contentId
            : a.kind === "annotation"
              ? (annContent.get(a.annotationId) ?? null)
              : a.kind === "set"
                ? (setContent.get(a.setId) ?? null)
                : null,
        toAnnotationId: a.kind === "annotation" ? a.annotationId : null,
        toSetId: a.kind === "set" ? a.setId : null,
        anchor: a as unknown as Record<string, unknown>,
      };
    });
    await this.db.transaction(async (tx) => {
      await tx.delete(links).where(and(eq(links.fromKind, fromKind), eq(links.fromId, fromId)));
      if (rows.length) await tx.insert(links).values(rows);
    });
  }

  async backlinksTo(contentId: ContentId) {
    const rows = await this.db
      .select()
      .from(links)
      .where(eq(links.toContentId, contentId))
      .orderBy(desc(links.createdAt));
    return rows.map(toDomain).filter((r): r is LinkRecord => r !== null);
  }

  async backlinksToAnnotation(annotationId: AnnotationId) {
    const rows = await this.db
      .select()
      .from(links)
      .where(eq(links.toAnnotationId, annotationId))
      .orderBy(desc(links.createdAt));
    return rows.map(toDomain).filter((r): r is LinkRecord => r !== null);
  }
}
