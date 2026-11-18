import { type EmbeddingProvider, ok, type Result } from "@thoth/core";
import { E5_DIMS } from "./transformers-provider";

/**
 * Deterministic embeddings for tests: each word is hashed into one of `dims` buckets and the
 * vector is normalized. Texts that share words are close; texts that do not are orthogonal.
 * It knows nothing about meaning, so it cannot stand in for the semantic tests.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly model = "fake/bag-of-words";
  readonly calls: { texts: string[]; kind: "query" | "passage" }[] = [];

  constructor(readonly dims: number = E5_DIMS) {}

  async embed(texts: string[], kind: "query" | "passage"): Promise<Result<number[][]>> {
    this.calls.push({ texts, kind });
    return ok(texts.map((t) => bagOfWords(t, this.dims)));
  }
}

export function bagOfWords(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
    const slot = (h >>> 0) % dims;
    v[slot] = (v[slot] ?? 0) + 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}
