import { describe, expect, it } from "vitest";
import type { Content, Segment, SegmentHit } from "../../domain/content";
import type { EmbeddingProvider, VectorHit, VectorRepository } from "../../ports/embeddings";
import type { ContentRepository, SegmentRepository } from "../../ports/repositories";
import type { ContentId, SegmentId } from "../../shared/id";
import { appError, err, ok } from "../../shared/result";
import { clearSearchIndex, embedMissingSegments, getSearchIndexStatus } from "./indexing";
import { retrieveSegments } from "./retrieve";
import { RRF_K, reciprocalRankFusion } from "./rrf";

const C1 = "c1" as ContentId;
const C2 = "c2" as ContentId;
const seg = (id: string, contentId: ContentId, idx: number, text = id): Segment => ({
  id: id as SegmentId,
  contentId,
  idx,
  text,
  locator: { type: "page", page: idx + 1 },
});

const all = [seg("a", C1, 0), seg("b", C1, 1), seg("c", C1, 2), seg("d", C2, 0)];

/** FTS returns the given ids in order; listByContent reads from `all`. */
function segmentsRepo(ftsIds: string[], reads: ContentId[] = []): SegmentRepository {
  return {
    replaceForContent: async () => undefined,
    listByContent: async (id) => {
      reads.push(id);
      return all.filter((s) => s.contentId === id);
    },
    search: async (ids, _q, limit): Promise<SegmentHit[]> =>
      ftsIds
        .map((id, i) => ({ segment: all.find((s) => s.id === id) as Segment, rank: -10 + i }))
        .filter((h) => ids.includes(h.segment.contentId))
        .slice(0, limit),
  };
}

function vectorsRepo(hits: Omit<VectorHit, "contentId">[] | Error): VectorRepository {
  return {
    upsert: async () => undefined,
    search: async (ids) => {
      if (hits instanceof Error) throw hits;
      return hits
        .map((h) => ({
          ...h,
          contentId: (all.find((s) => s.id === h.segmentId)?.contentId ?? C1) as ContentId,
        }))
        .filter((h) => ids.includes(h.contentId));
    },
    missingSegments: async () => [],
    deleteForContent: async () => undefined,
  };
}

const provider = (impl?: EmbeddingProvider["embed"]): EmbeddingProvider & { queries: string[] } => {
  const queries: string[] = [];
  return {
    model: "test-model",
    dims: 2,
    queries,
    embed:
      impl ??
      (async (texts, kind) => {
        if (kind === "query") queries.push(...texts);
        return ok(texts.map(() => [1, 0]));
      }),
  };
};

const vh = (id: string, distance: number) => ({ segmentId: id as SegmentId, distance });
const ids = (r: { hits: { segment: Segment }[] }) => r.hits.map((h) => h.segment.id);

describe("reciprocalRankFusion", () => {
  it("scores 1/(k + rank) and adds up across lists", () => {
    const fused = reciprocalRankFusion([
      ["a", "b", "c"],
      ["c", "d"],
    ]);
    expect(fused.map((f) => f.id)).toEqual(["c", "a", "b", "d"]);
    const c = fused[0];
    expect(c?.score).toBeCloseTo(1 / (RRF_K + 3) + 1 / (RRF_K + 1), 12);
    expect(c?.ranks).toEqual([3, 1]);
    expect(fused.find((f) => f.id === "d")?.ranks).toEqual([null, 2]);
  });

  it("counts an id repeated inside one list once, at its best rank", () => {
    const fused = reciprocalRankFusion([["a", "a", "b"]]);
    expect(fused.map((f) => [f.id, f.ranks[0]])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("keeps first-seen order on ties and handles empty input", () => {
    expect(reciprocalRankFusion([["x"], ["y"]]).map((f) => f.id)).toEqual(["x", "y"]);
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("uses a custom k", () => {
    expect(reciprocalRankFusion([["a"]], 0)[0]?.score).toBe(1);
  });
});

describe("retrieveSegments", () => {
  it("fuses FTS and vector hits, deduped, with both ranks", async () => {
    const e = provider();
    const r = await retrieveSegments(
      {
        segments: segmentsRepo(["a", "b"]),
        vectors: vectorsRepo([vh("b", 0.1), vh("c", 0.2)]),
        embeddings: e,
      },
      { contentIds: [C1], query: "  energy  ", k: 10 },
    );
    expect(r.mode).toBe("hybrid");
    expect(r.fallback).toBeNull();
    expect(ids(r)).toEqual(["b", "a", "c"]);
    expect(r.hits[0]).toMatchObject({ ftsRank: 2, vectorRank: 1, distance: 0.1 });
    expect(r.hits[1]).toMatchObject({ ftsRank: 1, vectorRank: null, distance: null });
    expect(e.queries).toEqual(["energy"]);
  });

  it("finds paraphrases that FTS misses", async () => {
    const r = await retrieveSegments(
      { segments: segmentsRepo([]), vectors: vectorsRepo([vh("c", 0.15)]), embeddings: provider() },
      { contentIds: [C1], query: "power plant of the cell", k: 5 },
    );
    expect(r.mode).toBe("hybrid");
    expect(ids(r)).toEqual(["c"]);
  });

  it("returns at most k hits", async () => {
    const r = await retrieveSegments(
      {
        segments: segmentsRepo(["a", "b", "c"]),
        vectors: vectorsRepo([vh("c", 0.1), vh("b", 0.2)]),
        embeddings: provider(),
      },
      { contentIds: [C1], query: "q", k: 2 },
    );
    // c: 1/63 + 1/61 edges out b: 2/62.
    expect(ids(r)).toEqual(["c", "b"]);
  });

  it("resolves vector-only hits from `known` first, else reads each content once", async () => {
    const reads: ContentId[] = [];
    const deps = {
      segments: segmentsRepo([], reads),
      vectors: vectorsRepo([vh("a", 0.1), vh("b", 0.2), vh("d", 0.3)]),
      embeddings: provider(),
    };
    await retrieveSegments(deps, {
      contentIds: [C1, C2],
      query: "q",
      k: 5,
      known: all.slice(0, 3),
    });
    expect(reads).toEqual([C2]);
    reads.length = 0;
    const r = await retrieveSegments(deps, { contentIds: [C1, C2], query: "q", k: 5 });
    expect(reads.sort()).toEqual([C1, C2]);
    expect(ids(r)).toEqual(["a", "b", "d"]);
  });

  it("drops vector hits beyond maxDistance but stays hybrid", async () => {
    const r = await retrieveSegments(
      {
        segments: segmentsRepo([]),
        vectors: vectorsRepo([vh("a", 0.1), vh("b", 0.4)]),
        embeddings: provider(),
      },
      { contentIds: [C1], query: "q", k: 5, maxDistance: 0.2 },
    );
    expect(r.mode).toBe("hybrid");
    expect(ids(r)).toEqual(["a"]);
  });

  it("skips a vector whose segment no longer exists", async () => {
    const r = await retrieveSegments(
      {
        segments: segmentsRepo([]),
        vectors: vectorsRepo([vh("gone", 0.1), vh("a", 0.2)]),
        embeddings: provider(),
      },
      { contentIds: [C1], query: "q", k: 5 },
    );
    expect(ids(r)).toEqual(["a"]);
  });

  describe("falls back to FTS alone", () => {
    const fts = segmentsRepo(["b", "a"]);

    it("without an embeddings provider", async () => {
      const r = await retrieveSegments({ segments: fts }, { contentIds: [C1], query: "q", k: 1 });
      expect(r).toMatchObject({ mode: "fts", fallback: "no_provider" });
      expect(r.note).toContain("keywords");
      expect(ids(r)).toEqual(["b"]);
      expect(r.hits[0]).toMatchObject({ ftsRank: 1, vectorRank: null });
    });

    it("when the contents have no vectors yet", async () => {
      const r = await retrieveSegments(
        { segments: fts, vectors: vectorsRepo([]), embeddings: provider() },
        { contentIds: [C1], query: "q", k: 5 },
      );
      expect(r).toMatchObject({ mode: "fts", fallback: "no_vectors" });
      expect(ids(r)).toEqual(["b", "a"]);
    });

    it("when the model fails", async () => {
      const e = provider(async () => err(appError("llm_unavailable", "offline")));
      const r = await retrieveSegments(
        { segments: fts, vectors: vectorsRepo([vh("c", 0.1)]), embeddings: e },
        { contentIds: [C1], query: "q", k: 5 },
      );
      expect(r).toMatchObject({ mode: "fts", fallback: "embed_failed" });
    });

    it("when the model is too slow (first download)", async () => {
      const e = provider(() => new Promise(() => undefined));
      const r = await retrieveSegments(
        { segments: fts, vectors: vectorsRepo([vh("c", 0.1)]), embeddings: e },
        { contentIds: [C1], query: "q", k: 5, embedTimeoutMs: 5 },
      );
      expect(r).toMatchObject({ mode: "fts", fallback: "embed_timeout" });
      expect(ids(r)).toEqual(["b", "a"]);
    });

    it("when the vector index throws", async () => {
      const r = await retrieveSegments(
        { segments: fts, vectors: vectorsRepo(new Error("no such index")), embeddings: provider() },
        { contentIds: [C1], query: "q", k: 5 },
      );
      expect(r).toMatchObject({ mode: "fts", fallback: "vector_error" });
    });
  });

  it("returns nothing for an empty query, no contents or k = 0, without embedding", async () => {
    const e = provider();
    const deps = {
      segments: segmentsRepo(["a"]),
      vectors: vectorsRepo([vh("a", 0)]),
      embeddings: e,
    };
    expect((await retrieveSegments(deps, { contentIds: [C1], query: "  ", k: 5 })).hits).toEqual(
      [],
    );
    expect((await retrieveSegments(deps, { contentIds: [], query: "q", k: 5 })).hits).toEqual([]);
    expect((await retrieveSegments(deps, { contentIds: [C1], query: "q", k: 0 })).hits).toEqual([]);
    expect(e.queries).toEqual([]);
  });
});

describe("indexing", () => {
  function memoryVectors(segments: Segment[]) {
    const stored = new Map<string, { model: string; vector: number[] }>();
    const repo: VectorRepository = {
      upsert: async (model, items) => {
        for (const it of items) stored.set(it.segmentId, { model, vector: it.vector });
      },
      search: async () => [],
      missingSegments: async (model, limit) =>
        segments.filter((s) => stored.get(s.id)?.model !== model).slice(0, limit),
      deleteForContent: async (id) => {
        for (const s of segments) if (s.contentId === id) stored.delete(s.id);
      },
    };
    return { repo, stored };
  }

  it("embeds missing segments in batches as passages until done", async () => {
    const v = memoryVectors(all);
    const kinds: string[] = [];
    const e = provider(async (texts, kind) => {
      kinds.push(kind);
      return ok(texts.map(() => [0, 1]));
    });
    const deps = { vectors: v.repo, embeddings: e };
    expect(await embedMissingSegments(deps, 3)).toEqual(ok({ embedded: 3, more: true }));
    expect(await embedMissingSegments(deps, 3)).toEqual(ok({ embedded: 1, more: false }));
    expect(await embedMissingSegments(deps, 3)).toEqual(ok({ embedded: 0, more: false }));
    expect(v.stored.size).toBe(4);
    expect(kinds).toEqual(["passage", "passage"]);
  });

  it("stores nothing when the model fails", async () => {
    const v = memoryVectors(all);
    const e = provider(async () => err(appError("llm_unavailable", "offline")));
    const r = await embedMissingSegments({ vectors: v.repo, embeddings: e }, 3);
    expect(r.ok).toBe(false);
    expect(v.stored.size).toBe(0);
  });

  it("reports status over ready contents and clears the index", async () => {
    const v = memoryVectors(all);
    const contents = {
      listRecent: async () =>
        [
          { id: C1, status: "ready" },
          { id: C2, status: "processing" },
        ] as Content[],
    } as unknown as ContentRepository;
    const segments = segmentsRepo([]);
    const e = provider();
    await embedMissingSegments({ vectors: v.repo, embeddings: e }, 2);
    expect(
      await getSearchIndexStatus({ contents, segments, vectors: v.repo, embeddings: e }),
    ).toEqual({ enabled: true, model: "test-model", total: 3, indexed: 2 });
    expect(await getSearchIndexStatus({ contents, segments, vectors: v.repo })).toMatchObject({
      enabled: false,
      total: 3,
    });
    await clearSearchIndex({ contents, vectors: v.repo });
    expect(v.stored.size).toBe(0);
  });
});
