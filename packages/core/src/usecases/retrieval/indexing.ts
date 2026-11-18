import type { EmbeddingProvider, VectorRepository } from "../../ports/embeddings";
import type { ContentRepository, SegmentRepository } from "../../ports/repositories";
import { ok, type Result } from "../../shared/result";

/** Segments per indexing step: small enough that ingest and queries interleave with it. */
export const EMBED_BATCH = 32;

export interface IndexingDeps {
  vectors: VectorRepository;
  embeddings: EmbeddingProvider;
}

export interface IndexStep {
  /** Segments embedded and stored in this step. */
  embedded: number;
  /** True when a full batch was found, so there may be more to do. */
  more: boolean;
}

/**
 * One step of the background index (ADR-0029): embeds up to `batch` segments that have no
 * vector for the current model, oldest content first, and stores them. The web app's indexer
 * loop calls it until `more` is false. A model failure returns the error and stores nothing.
 */
export async function embedMissingSegments(
  deps: IndexingDeps,
  batch = EMBED_BATCH,
): Promise<Result<IndexStep>> {
  const missing = await deps.vectors.missingSegments(deps.embeddings.model, batch);
  if (missing.length === 0) return ok({ embedded: 0, more: false });
  const vectors = await deps.embeddings.embed(
    missing.map((s) => s.text),
    "passage",
  );
  if (!vectors.ok) return vectors;
  await deps.vectors.upsert(
    deps.embeddings.model,
    missing.flatMap((s, i) => {
      const vector = vectors.value[i];
      return vector ? [{ segmentId: s.id, contentId: s.contentId, vector }] : [];
    }),
  );
  return ok({ embedded: missing.length, more: missing.length >= batch });
}

export interface SearchIndexStatus {
  /** False when no embeddings provider is configured. */
  enabled: boolean;
  model: string | null;
  /** Passages of ready contents. */
  total: number;
  /** Of those, how many have a vector for the current model. */
  indexed: number;
}

/** Contents scanned for the status line; a single owner has far fewer. */
const STATUS_CONTENT_LIMIT = 5_000;
const STATUS_SEGMENT_LIMIT = 1_000_000;

/**
 * "Search index: 1,240 of 1,300 passages ready". Counts through the existing ports (there is
 * no count query yet), which is fine for one owner's library: one read per content.
 */
export async function getSearchIndexStatus(deps: {
  contents: ContentRepository;
  segments: SegmentRepository;
  vectors: VectorRepository;
  embeddings?: EmbeddingProvider;
}): Promise<SearchIndexStatus> {
  const contents = (await deps.contents.listRecent(STATUS_CONTENT_LIMIT)).filter(
    (c) => c.status === "ready",
  );
  let total = 0;
  for (const c of contents) total += (await deps.segments.listByContent(c.id)).length;
  if (!deps.embeddings) return { enabled: false, model: null, total, indexed: 0 };
  const ready = new Set<string>(contents.map((c) => c.id));
  // Contents still processing also have segments without vectors, so read past `total`.
  const missing = (
    await deps.vectors.missingSegments(deps.embeddings.model, STATUS_SEGMENT_LIMIT)
  ).filter((s) => ready.has(s.contentId)).length;
  return {
    enabled: true,
    model: deps.embeddings.model,
    total,
    indexed: Math.max(0, total - missing),
  };
}

/** Drops every content's vectors so the indexer embeds them again ("Rebuild"). */
export async function clearSearchIndex(deps: {
  contents: ContentRepository;
  vectors: VectorRepository;
}): Promise<number> {
  const contents = await deps.contents.listRecent(STATUS_CONTENT_LIMIT);
  for (const c of contents) await deps.vectors.deleteForContent(c.id);
  return contents.length;
}
