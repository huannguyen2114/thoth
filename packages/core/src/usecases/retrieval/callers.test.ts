/**
 * The three callers of hybrid retrieval (ADR-0029): chat context for large sources, Cmd+K
 * source search and query-led exam sampling. Vectors here are scripted: the point is the
 * wiring and the fallbacks, not the model (see packages/embeddings live tests for that).
 */
import { describe, expect, it } from "vitest";
import type { Content, Segment } from "../../domain/content";
import type { EmbeddingProvider, VectorHit, VectorRepository } from "../../ports/embeddings";
import type {
  ContentRepository,
  NoteRepository,
  SegmentRepository,
} from "../../ports/repositories";
import type { ContentId, SegmentId } from "../../shared/id";
import { ok } from "../../shared/result";
import { buildChatContext } from "../chat/context";
import { sampleForQuery } from "../exams/sampling";
import { searchEverything } from "../search/search";

const C = "c1" as ContentId;
const pages = [
  "Glycolysis splits glucose into pyruvate.",
  "Without oxygen, yeast ferments pyruvate into ethanol.",
  "The Krebs cycle runs in the matrix.",
  "Mitochondria are the power plant of the cell.",
].map(
  (text, idx): Segment => ({
    id: `s${idx}` as SegmentId,
    contentId: C,
    idx,
    text,
    locator: { type: "page", page: idx + 1 },
  }),
);

/** FTS: a segment matches when it contains every query word (like FTS5's implicit AND). */
const segments: SegmentRepository = {
  replaceForContent: async () => undefined,
  listByContent: async () => pages,
  search: async (_ids, q, limit) => {
    const words = q.toLowerCase().match(/\p{L}+/gu) ?? [];
    return pages
      .filter((s) => words.length > 0 && words.every((w) => s.text.toLowerCase().includes(w)))
      .slice(0, limit)
      .map((segment, i) => ({ segment, rank: -1 + i * 0.1 }));
  },
};

/** The "model": each query is scripted to land nearest one page. */
function semantic(nearest: Record<string, number>) {
  let current = -1;
  const embeddings: EmbeddingProvider = {
    model: "test",
    dims: 1,
    embed: async (texts) => {
      current = nearest[texts[0] ?? ""] ?? -1;
      return ok([[current]]);
    },
  };
  const vectors: VectorRepository = {
    upsert: async () => undefined,
    missingSegments: async () => [],
    deleteForContent: async () => undefined,
    search: async (_ids, [page]): Promise<VectorHit[]> =>
      pages
        .map((s) => ({
          segmentId: s.id,
          contentId: C,
          distance: s.idx === page ? 0.1 : 0.5,
        }))
        .sort((a, b) => a.distance - b.distance),
  };
  return { embeddings, vectors };
}

const content = { id: C, title: "Cell respiration", kind: "pdf" } as const;

describe("chat context for a large source", () => {
  const question = "how do cells get energy without oxygen?";

  it("retrieves the fermentation page although the words differ", async () => {
    const s = semantic({ [question]: 1 });
    const ctx = await buildChatContext({ segments, ...s }, content, question, {
      maxFullTokens: 1,
      topK: 1,
    });
    expect(ctx.mode).toBe("search");
    expect(ctx.retrieval).toMatchObject({ mode: "hybrid", fallback: null });
    expect(ctx.segments.map((x) => x.idx)).toEqual([1]);
    expect(ctx.text).toContain("[p.2] Without oxygen");
  });

  it("says when it used keywords only", async () => {
    const ctx = await buildChatContext({ segments }, content, question, {
      maxFullTokens: 1,
      topK: 1,
    });
    expect(ctx.retrieval).toMatchObject({ mode: "fts", fallback: "no_provider" });
  });

  it("leaves small sources whole", async () => {
    const ctx = await buildChatContext({ segments, ...semantic({}) }, content, question);
    expect(ctx.mode).toBe("full");
    expect(ctx.retrieval).toBeUndefined();
  });
});

describe("Cmd+K source search", () => {
  const deps = (extra: object) => ({
    contents: {
      listRecent: async () => [{ ...content, sourceUrl: null } as unknown as Content],
    } as unknown as ContentRepository,
    notes: { list: async () => [] } as unknown as NoteRepository,
    segments,
    ...extra,
  });

  it("finds a paraphrase", async () => {
    const hits = await searchEverything(deps(semantic({ "power station of a cell": 3 })), {
      query: "power station of a cell",
    });
    expect(hits.map((h) => [h.kind, h.at])).toEqual([["source", "[p.4]"]]);
  });

  it("shows nothing for a query that is not close to any passage", async () => {
    const hits = await searchEverything(deps(semantic({})), { query: "qwzx" });
    expect(hits).toEqual([]);
  });

  it("still finds keywords without vectors", async () => {
    const hits = await searchEverything(deps({}), { query: "krebs" });
    expect(hits.map((h) => h.at)).toEqual(["[p.3]"]);
  });
});

describe("query-led exam sampling", () => {
  it("samples the passages that match the focus, in source order", async () => {
    const s = semantic({ "anaerobic respiration": 1 });
    const picked = await sampleForQuery(
      { segments, ...s },
      { chapters: [], segments: pages, query: "anaerobic respiration", maxChars: 60 },
    );
    // Only the best match fits in 60 characters.
    expect(picked.map((x) => x.idx)).toEqual([1]);
    const wider = await sampleForQuery(
      { segments, ...s },
      { chapters: [], segments: pages, query: "anaerobic respiration", maxChars: 100 },
    );
    expect(wider.map((x) => x.idx)).toEqual([0, 1]);
  });

  it("keeps the chapter sampling when there is no focus", async () => {
    const picked = await sampleForQuery(
      { segments },
      { chapters: [], segments: pages, query: " " },
    );
    expect(picked).toEqual(pages);
  });
});
