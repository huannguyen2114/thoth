import type { ContentId } from "../shared/id";

/** One editable notes document per content (Phase 4). */
export interface Note {
  contentId: ContentId;
  markdown: string;
  updatedAt: Date;
}
