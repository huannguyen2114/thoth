import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ContentId,
  embedMissingSegments,
  retrieveSegments,
  SEMANTIC_MAX_DISTANCE,
  searchEverything,
} from "@thoth/core";
import {
  createDb,
  DrizzleContentRepository,
  DrizzleNoteRepository,
  DrizzleSegmentRepository,
  DrizzleVectorRepository,
  migrateDb,
} from "@thoth/db";
import { beforeAll, describe, expect, it } from "vitest";
// The seed is not exported from @thoth/db (it is a dev script); the test reads it directly.
import { SAMPLE_LECTURE_ID, SAMPLE_PDF_ID, seedSampleContent } from "../../db/src/seed";
import { TransformersEmbeddingProvider } from "./transformers-provider";

/**
 * End to end with the real model (ADR-0029): seeded sample contents in an in-memory libSQL
 * database, indexed by the background step, then queried the way chat and Cmd+K query.
 * Opt in with THOTH_LIVE_EMBED=1 (the model is cached under <THOTH_DATA_DIR>/models).
 */
const live = process.env.THOTH_LIVE_EMBED === "1";
const dataDir =
  process.env.THOTH_DATA_DIR ?? fileURLToPath(new URL("../../../data", import.meta.url));
const migrations = fileURLToPath(new URL("../../db/drizzle", import.meta.url));

describe.skipIf(!live)("hybrid retrieval on the sample contents (live model)", () => {
  const db = createDb(":memory:");
  const segments = new DrizzleSegmentRepository(db);
  const vectors = new DrizzleVectorRepository(db);
  const embeddings = new TransformersEmbeddingProvider({ cacheDir: resolve(dataDir, "models") });
  const deps = {
    segments,
    vectors,
    embeddings,
    contents: new DrizzleContentRepository(db),
    notes: new DrizzleNoteRepository(db),
  };
  const both = [SAMPLE_PDF_ID, SAMPLE_LECTURE_ID] as ContentId[];

  beforeAll(async () => {
    await migrateDb(db, migrations);
    await seedSampleContent(db);
    let embedded = 0;
    const t0 = performance.now();
    for (;;) {
      const step = await embedMissingSegments({ vectors, embeddings });
      if (!step.ok) throw new Error(step.error.message);
      embedded += step.value.embedded;
      if (!step.value.more) break;
    }
    const s = (performance.now() - t0) / 1000;
    console.info(`[live] indexed ${embedded} passages in ${s.toFixed(2)} s (includes model load)`);
  }, 600_000);

  it("chat: 'how do cells get energy without oxygen?' finds the fermentation page by meaning", async () => {
    const r = await retrieveSegments(deps, {
      contentIds: [SAMPLE_PDF_ID],
      query: "how do cells get energy without oxygen?",
      k: 3,
    });
    log("chat", r.hits);
    expect(r.mode).toBe("hybrid");
    const fermentation = r.hits.find((h) => h.segment.text.includes("fermentation"));
    expect(fermentation?.vectorRank).toBe(1);
    expect(r.hits[0]?.segment.locator).toEqual({ type: "page", page: 6 });
  });

  it("chat: a paraphrase that shares no content word is still retrieved", async () => {
    // "in" and "e.g." are the only overlaps, so keywords alone would never pick page 6.
    const r = await retrieveSegments(deps, {
      contentIds: [SAMPLE_PDF_ID],
      query: "What happens in anaerobic conditions, e.g. a sprinter's legs?",
      k: 5,
    });
    log("anaerobic", r.hits);
    const fermentation = r.hits.find((h) => h.segment.text.includes("fermentation"));
    expect(fermentation).toMatchObject({ ftsRank: null, vectorRank: 1 });
  });

  it("Cmd+K: 'power plant of the cell' finds the mitochondria page", async () => {
    const hits = await searchEverything(deps, { query: "power plant of the cell" });
    const source = hits.filter((h) => h.kind === "source");
    expect(source[0]).toMatchObject({ contentId: SAMPLE_PDF_ID, at: "[p.3]" });
  });

  it("Cmd+K: a Vietnamese query finds the English source", async () => {
    // "How do cells get energy when there is no oxygen?"
    const query = "tế bào lấy năng lượng khi không có oxy";
    const r = await retrieveSegments(deps, {
      contentIds: both,
      query,
      k: 3,
      maxDistance: SEMANTIC_MAX_DISTANCE,
    });
    log("vi", r.hits);
    expect(r.hits.find((h) => h.vectorRank === 1)?.segment.locator).toEqual({
      type: "page",
      page: 6,
    });
    const hits = await searchEverything(deps, { query });
    expect(hits.find((h) => h.kind === "source")).toMatchObject({
      contentId: SAMPLE_PDF_ID,
      at: "[p.6]",
    });
  });

  it("Cmd+K: unrelated queries show no passages (distance cut-off)", async () => {
    for (const query of ["qwzx plorb", "tax law", "recipe for pancakes", "bóng đá"]) {
      const r = await retrieveSegments(deps, {
        contentIds: both,
        query,
        k: 5,
        maxDistance: SEMANTIC_MAX_DISTANCE,
      });
      // Keyword hits on words like "for" may remain (FTS ORs every word); no vector hit does.
      expect(r.hits.filter((h) => h.vectorRank !== null)).toEqual([]);
    }
    expect(await searchEverything(deps, { query: "qwzx plorb" })).toEqual([]);
  });

  it("measures throughput on warm passages", async () => {
    const texts = Array.from(
      { length: 128 },
      (_, i) =>
        `Passage ${i}. Oxidative phosphorylation uses the electron transport chain on the inner membrane; pumped protons flow back through ATP synthase, which produces most of the cell's ATP while oxygen is the final electron acceptor.`,
    );
    const t0 = performance.now();
    const r = await embeddings.embed(texts, "passage");
    const s = (performance.now() - t0) / 1000;
    expect(r.ok).toBe(true);
    console.info(
      `[live] throughput: ${(texts.length / s).toFixed(1)} passages/s (${texts.length} short passages in ${s.toFixed(2)} s)`,
    );
    // A full PDF page is longer than the model's 512-token window, so it is truncated.
    const pages = texts.slice(0, 32).map((t) => `${t} `.repeat(8));
    const t1 = performance.now();
    expect((await embeddings.embed(pages, "passage")).ok).toBe(true);
    const s1 = (performance.now() - t1) / 1000;
    console.info(
      `[live] throughput: ${(pages.length / s1).toFixed(1)} pages/s (${pages.length} pages of ${pages[0]?.length} chars in ${s1.toFixed(2)} s)`,
    );
  }, 120_000);
});

function log(
  label: string,
  hits: {
    segment: { text: string };
    distance: number | null;
    ftsRank: number | null;
    vectorRank: number | null;
  }[],
) {
  for (const h of hits) {
    console.info(
      `[live] ${label}: d=${h.distance?.toFixed(3) ?? "-"} fts=${h.ftsRank ?? "-"} vec=${h.vectorRank ?? "-"} ${h.segment.text.slice(0, 60)}`,
    );
  }
}
