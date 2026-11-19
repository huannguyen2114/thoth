import type { Segment } from "../../domain/content";
import type { EmbeddingProvider, VectorHit, VectorRepository } from "../../ports/embeddings";
import type { SegmentRepository } from "../../ports/repositories";
import type { ContentId } from "../../shared/id";
import { RRF_K, reciprocalRankFusion } from "./rrf";

/**
 * Hybrid retrieval (ADR-0029): FTS5 keywords and local vector search, merged by reciprocal
 * rank fusion. Without an embeddings provider or vectors it is plain FTS, and says so.
 * See docs/technical_design/16-embeddings-and-retrieval.md.
 */
export interface RetrievalDeps {
  segments: SegmentRepository;
  vectors?: VectorRepository | undefined;
  embeddings?: EmbeddingProvider | undefined;
}

export interface RetrieveInput {
  contentIds: readonly ContentId[];
  query: string;
  /** How many segments to return. */
  k: number;
  /**
   * Ignore vector hits farther than this cosine distance. Vector search always returns the
   * nearest segments, even for nonsense; a cut-off lets Cmd+K show nothing instead.
   */
  maxDistance?: number;
  /** Segments the caller has already loaded, used to resolve vector hits without a read. */
  known?: readonly Segment[];
  /** Give up on the query vector after this long and use keywords alone. Default 10 s. */
  embedTimeoutMs?: number;
}

export type RetrievalMode = "hybrid" | "fts";

/** Why retrieval used keywords only. */
export type RetrievalFallback =
  | "no_provider"
  | "no_vectors"
  | "embed_failed"
  | "embed_timeout"
  | "vector_error";

export interface RetrievedSegment {
  segment: Segment;
  /** RRF score; higher is better. */
  score: number;
  /** 1-based rank in the FTS list, or null when keywords did not find it. */
  ftsRank: number | null;
  /** 1-based rank in the vector list, or null when vectors did not find it. */
  vectorRank: number | null;
  /** Cosine distance to the query, when vectors found it. */
  distance: number | null;
}

export interface RetrievalResult {
  hits: RetrievedSegment[];
  mode: RetrievalMode;
  /** Set when `mode` is "fts": why vectors were not used. */
  fallback: RetrievalFallback | null;
  /** A human sentence for logs and captions, null in hybrid mode. */
  note: string | null;
}

const DEFAULT_EMBED_TIMEOUT_MS = 10_000;

const NOTES: Record<RetrievalFallback, string> = {
  no_provider: "Semantic search is off; matching keywords only.",
  no_vectors: "The search index is still being built; matching keywords only.",
  embed_failed: "The search model is unavailable; matching keywords only.",
  embed_timeout: "The search model is still loading; matching keywords only.",
  vector_error: "Vector search failed; matching keywords only.",
};

export async function retrieveSegments(
  deps: RetrievalDeps,
  input: RetrieveInput,
): Promise<RetrievalResult> {
  const k = Math.max(0, Math.floor(input.k));
  const contentIds = [...new Set(input.contentIds)];
  const query = input.query.trim();
  if (k === 0 || contentIds.length === 0 || query === "") {
    return { hits: [], mode: deps.embeddings ? "hybrid" : "fts", fallback: null, note: null };
  }
  // Each list brings more candidates than we return, so fusion can promote items both agree on.
  const pool = Math.max(k * 2, 20);

  const [fts, vec] = await Promise.all([
    deps.segments.search(contentIds, query, pool),
    vectorHits(deps, contentIds, query, pool, input.embedTimeoutMs ?? DEFAULT_EMBED_TIMEOUT_MS),
  ]);

  if (!vec.ok) {
    return {
      hits: fts.slice(0, k).map((h, i) => ({
        segment: h.segment,
        score: 1 / (RRF_K + i + 1),
        ftsRank: i + 1,
        vectorRank: null,
        distance: null,
      })),
      mode: "fts",
      fallback: vec.reason,
      note: NOTES[vec.reason],
    };
  }

  const near =
    input.maxDistance === undefined
      ? vec.hits
      : vec.hits.filter((h) => h.distance <= (input.maxDistance as number));
  const distance = new Map(near.map((h) => [h.segmentId as string, h.distance]));
  const fused = reciprocalRankFusion([
    fts.map((h) => h.segment.id as string),
    near.map((h) => h.segmentId as string),
  ]).slice(0, k);

  const segments = await resolveSegments(
    deps.segments,
    fused.map((f) => f.id),
    [...fts.map((h) => h.segment), ...(input.known ?? [])],
    near,
  );
  const hits: RetrievedSegment[] = [];
  for (const f of fused) {
    const segment = segments.get(f.id);
    // A vector whose segment was replaced since indexing: skip it.
    if (!segment) continue;
    hits.push({
      segment,
      score: f.score,
      ftsRank: f.ranks[0] ?? null,
      vectorRank: f.ranks[1] ?? null,
      distance: distance.get(f.id) ?? null,
    });
  }
  return { hits, mode: "hybrid", fallback: null, note: null };
}

type VectorOutcome = { ok: true; hits: VectorHit[] } | { ok: false; reason: RetrievalFallback };

async function vectorHits(
  deps: RetrievalDeps,
  contentIds: ContentId[],
  query: string,
  pool: number,
  timeoutMs: number,
): Promise<VectorOutcome> {
  if (!deps.embeddings || !deps.vectors) return { ok: false, reason: "no_provider" };
  const embedded = await withTimeout(deps.embeddings.embed([query], "query"), timeoutMs);
  if (embedded === "timeout") return { ok: false, reason: "embed_timeout" };
  if (!embedded.ok) return { ok: false, reason: "embed_failed" };
  const [vector] = embedded.value;
  if (!vector) return { ok: false, reason: "embed_failed" };
  try {
    const hits = await deps.vectors.search(contentIds, vector, pool);
    return hits.length > 0 ? { ok: true, hits } : { ok: false, reason: "no_vectors" };
  } catch {
    // An infrastructure fault in the vector index must not break chat or search.
    return { ok: false, reason: "vector_error" };
  }
}

/** Looks segments up among those already loaded, then reads each missing content once. */
async function resolveSegments(
  repo: SegmentRepository,
  ids: string[],
  loaded: Segment[],
  vectorHitsList: VectorHit[],
): Promise<Map<string, Segment>> {
  const byId = new Map(loaded.map((s) => [s.id as string, s]));
  const wanted = new Set(ids.filter((id) => !byId.has(id)));
  const contents = new Set(
    vectorHitsList.filter((h) => wanted.has(h.segmentId)).map((h) => h.contentId),
  );
  for (const contentId of contents) {
    for (const s of await repo.listByContent(contentId)) byId.set(s.id, s);
  }
  return byId;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
