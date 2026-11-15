import type { ContentId, SpaceId } from "../shared/id";

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

/**
 * Where a piece of text lives inside its source. Every citation, chapter and
 * summary range is expressed as a Locator. See docs/technical_design/03-ingestion.md.
 */
export type Locator =
  | { type: "page"; page: number }
  | { type: "time"; startSec: number; endSec: number }
  | { type: "offset"; start: number; end: number };
