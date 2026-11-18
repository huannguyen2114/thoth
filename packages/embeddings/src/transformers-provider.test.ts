import { describe, expect, it } from "vitest";
import { bagOfWords, FakeEmbeddingProvider } from "./fake-provider";
import {
  E5_DIMS,
  type ExtractorLoader,
  TransformersEmbeddingProvider,
} from "./transformers-provider";

/** A loader whose extractor returns a unit vector per text and records what it was given. */
function fakeLoader(seen: string[][], opts: { failFirst?: boolean; dims?: number } = {}) {
  let loads = 0;
  const loader: ExtractorLoader = async () => {
    loads++;
    if (opts.failFirst && loads === 1) throw new Error("fetch failed");
    return async (texts) => {
      seen.push(texts);
      return { tolist: () => texts.map(() => unit(opts.dims ?? E5_DIMS)) };
    };
  };
  return { loader, loads: () => loads };
}
const unit = (d: number) => Array.from({ length: d }, (_, i) => (i === 0 ? 1 : 0));

describe("TransformersEmbeddingProvider (fake model)", () => {
  it("adds the e5 prefixes and collapses whitespace", async () => {
    const seen: string[][] = [];
    const p = new TransformersEmbeddingProvider({
      cacheDir: "/x",
      loader: fakeLoader(seen).loader,
    });
    await p.embed(["what is ATP?"], "query");
    await p.embed(["Mitochondria\n\n make  ATP."], "passage");
    expect(seen).toEqual([["query: what is ATP?"], ["passage: Mitochondria make ATP."]]);
  });

  it("batches inputs and loads the model only once", async () => {
    const seen: string[][] = [];
    const f = fakeLoader(seen);
    const p = new TransformersEmbeddingProvider({ cacheDir: "/x", batchSize: 2, loader: f.loader });
    const r = await p.embed(["a", "b", "c", "d", "e"], "passage");
    await p.embed(["f"], "passage");
    expect(r.ok && r.value.length).toBe(5);
    expect(seen.map((b) => b.length)).toEqual([2, 2, 1, 1]);
    expect(f.loads()).toBe(1);
    expect(p.loaded).toBe(true);
  });

  it("returns an empty list without loading the model", async () => {
    const f = fakeLoader([]);
    const p = new TransformersEmbeddingProvider({ cacheDir: "/x", loader: f.loader });
    expect(await p.embed([], "query")).toEqual({ ok: true, value: [] });
    expect(f.loads()).toBe(0);
  });

  it("reports a failed download as a Result and retries on the next call", async () => {
    const f = fakeLoader([], { failFirst: true });
    const p = new TransformersEmbeddingProvider({ cacheDir: "/x", loader: f.loader });
    const first = await p.embed(["x"], "query");
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error.code).toBe("llm_unavailable");
      expect(first.error.message).toContain("Check the internet connection");
    }
    expect((await p.embed(["x"], "query")).ok).toBe(true);
    expect(f.loads()).toBe(2);
  });

  it("rejects vectors of the wrong size", async () => {
    const p = new TransformersEmbeddingProvider({
      cacheDir: "/x",
      loader: fakeLoader([], { dims: 10 }).loader,
    });
    const r = await p.embed(["x"], "query");
    expect(r.ok).toBe(false);
  });
});

describe("FakeEmbeddingProvider", () => {
  it("returns normalized vectors of the right size; shared words are closer", async () => {
    const p = new FakeEmbeddingProvider();
    const r = await p.embed(["cell energy", "cell energy atp", "tax law"], "passage");
    if (!r.ok) throw new Error("unreachable");
    const [a, b, c] = r.value as [number[], number[], number[]];
    expect(a).toHaveLength(384);
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
    expect(bagOfWords("", 4)).toEqual([0, 0, 0, 0]);
  });
});

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
