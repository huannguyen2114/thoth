import { z } from "zod";
import type { ChapterId, ContentId, SegmentId, SpaceId } from "../shared/id";

export const contentKinds = ["pdf", "youtube", "webpage", "text"] as const;
export type ContentKind = (typeof contentKinds)[number];

export const contentStatuses = ["pending", "processing", "ready", "failed"] as const;
export type ContentStatus = (typeof contentStatuses)[number];

export interface Content {
  id: ContentId;
  spaceId: SpaceId | null;
  kind: ContentKind;
  title: string;
  sourceUrl: string | null;
  filePath: string | null;
  status: ContentStatus;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewContent {
  spaceId: SpaceId | null;
  kind: ContentKind;
  title: string;
  sourceUrl: string | null;
  filePath: string | null;
}

/**
 * Where a piece of text lives inside its source. Every citation, chapter and
 * summary range is expressed as a Locator. See docs/technical_design/03-ingestion.md.
 */
export const locatorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page"), page: z.number().int().min(1) }),
  z.object({ type: z.literal("time"), startSec: z.number().min(0), endSec: z.number().min(0) }),
  z.object({
    type: z.literal("offset"),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    /**
     * 1-based paragraph number, the `n` in a `[§n]` citation. The segment repository fills it
     * from the segment's position, so every stored text locator can be cited. See ADR-0019.
     */
    paragraph: z.number().int().min(1).optional(),
  }),
]);
export type Locator = z.infer<typeof locatorSchema>;

/** One addressable piece of source text: a PDF page, a transcript cue group, a paragraph. */
export interface Segment {
  id: SegmentId;
  contentId: ContentId;
  idx: number;
  text: string;
  locator: Locator;
}
export type NewSegment = Omit<Segment, "id" | "contentId">;

/** An AI-written section of the source (title + summary), shown in the Chapters tab. */
export interface Chapter {
  id: ChapterId;
  contentId: ContentId;
  idx: number;
  title: string;
  summary: string;
  locator: Locator;
}
export type NewChapter = Omit<Chapter, "id" | "contentId">;

export interface SegmentHit {
  segment: Segment;
  /** BM25 rank from FTS5: lower is better. */
  rank: number;
}
