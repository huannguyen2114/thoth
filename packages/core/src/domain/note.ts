import type { ContentId, NoteId, SpaceId } from "../shared/id";

/** Who a notes document belongs to: one content, or one space (Phase 10). */
export type NoteOwner = { contentId: ContentId } | { spaceId: SpaceId };

/** One editable notes document per content (Phase 4) or per space (Phase 10). */
export interface Note {
  id: NoteId;
  /** Exactly one of contentId and spaceId is set. */
  contentId: ContentId | null;
  spaceId: SpaceId | null;
  markdown: string;
  updatedAt: Date;
}

export const noteOwnerKey = (owner: NoteOwner): string =>
  "contentId" in owner ? `content:${owner.contentId}` : `space:${owner.spaceId}`;
