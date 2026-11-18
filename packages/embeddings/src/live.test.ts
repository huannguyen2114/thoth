import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { E5_DIMS, TransformersEmbeddingProvider } from "./transformers-provider";

/**
 * Runs the real model (downloads about 120 MB on first run). Opt in with THOTH_LIVE_EMBED=1.
 * The cache is `<THOTH_DATA_DIR>/models`, defaulting to the repo's `data/models`.
 */
const live = process.env.THOTH_LIVE_EMBED === "1";
const cacheDir = resolve(
  process.env.THOTH_DATA_DIR ?? resolve(__dirname, "../../../data"),
  "models",
);
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

describe.skipIf(!live)("TransformersEmbeddingProvider (live model)", () => {
  const p = new TransformersEmbeddingProvider({ cacheDir });

  it("returns 384-dimensional unit vectors", { timeout: 600_000 }, async () => {
    const r = await p.embed(["Mitochondria make ATP.", "Ty thể tạo ra ATP."], "passage");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value).toHaveLength(2);
    for (const v of r.value) {
      expect(v).toHaveLength(E5_DIMS);
      expect(Math.hypot(...v)).toBeCloseTo(1, 4);
    }
  });

  it("puts 'mitochondria make ATP' nearer 'cell energy' than 'tax law'", async () => {
    const q = await p.embed(["cell energy", "tax law"], "query");
    const d = await p.embed(["Mitochondria make ATP."], "passage");
    if (!q.ok || !d.ok) throw new Error("embedding failed");
    const [energy, tax] = q.value as [number[], number[]];
    const [doc] = d.value as [number[]];
    expect(dot(doc, energy)).toBeGreaterThan(dot(doc, tax));
  });

  it("matches a Vietnamese question to an English passage", async () => {
    const q = await p.embed(["Ty thể làm gì trong tế bào?"], "query");
    const d = await p.embed(
      ["Mitochondria produce most of the cell's ATP.", "The court ruled on the tax appeal."],
      "passage",
    );
    if (!q.ok || !d.ok) throw new Error("embedding failed");
    const [vi] = q.value as [number[]];
    const [bio, law] = d.value as [number[], number[]];
    expect(dot(vi, bio)).toBeGreaterThan(dot(vi, law));
  });
});
