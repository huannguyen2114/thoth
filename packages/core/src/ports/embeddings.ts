import type { Segment } from "../domain/content";
import type { ContentId, SegmentId } from "../shared/id";
import type { Result } from "../shared/result";

/**
 * Local text embeddings (ADR-0029). Implemented by @thoth/embeddings.
 * `kind` picks the model's prefix: "query" for questions, "passage" for source segments.
 */
export interface EmbeddingProvider {
  /** Model id stored with every vector, e.g. "Xenova/multilingual-e5-small". */
  readonly model: string;
  readonly dims: number;
  embed(texts: string[], kind: "query" | "passage"): Promise<Result<number[][]>>;
}

export interface VectorHit {
  segmentId: SegmentId;
  contentId: ContentId;
  /** Cosine distance: 0 is identical, 2 is opposite. Lower is better. */
  distance: number;
}

/** Segment vectors in libSQL (ADR-0029). Implemented by @thoth/db. */
export interface VectorRepository {
  upsert(
    model: string,
    items: { segmentId: SegmentId; contentId: ContentId; vector: number[] }[],
  ): Promise<void>;
  /** Nearest segments to `vector` within the given contents, best first. */
  search(contentIds: ContentId[], vector: number[], k: number): Promise<VectorHit[]>;
  /** Segments that have no vector for `model` yet, oldest content first (for backfill). */
  missingSegments(model: string, limit: number): Promise<Segment[]>;
  deleteForContent(contentId: ContentId): Promise<void>;
}
