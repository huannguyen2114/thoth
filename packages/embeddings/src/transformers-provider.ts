import { appError, type EmbeddingProvider, err, ok, type Result } from "@thoth/core";

/** ADR-0029: multilingual (Vietnamese and English), 384 dimensions, ONNX on the CPU. */
export const E5_MODEL = "Xenova/multilingual-e5-small";
export const E5_DIMS = 384;

/** e5 models are trained with these prefixes; leaving them out costs recall. */
export const E5_PREFIX = { query: "query: ", passage: "passage: " } as const;

/** The part of a Transformers.js feature-extraction pipeline this adapter uses. */
export type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist(): unknown }>;

/** Builds the extractor. The default downloads the model once into `cacheDir`. */
export type ExtractorLoader = (model: string, cacheDir: string) => Promise<Extractor>;

export interface TransformersEmbeddingOptions {
  /** Where model files are cached: `<THOTH_DATA_DIR>/models`. */
  cacheDir: string;
  /** Texts per model call. Larger batches are faster per text but use more memory. */
  batchSize?: number;
  /** Swapped in tests; production uses Transformers.js. */
  loader?: ExtractorLoader;
}

const DEFAULT_BATCH = 16;

/**
 * Local embeddings with Transformers.js (ADR-0029). The model is loaded lazily on the first
 * call and shared afterwards; a failed load (for example offline on first use) is not cached,
 * so the next call tries again.
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly model = E5_MODEL;
  readonly dims = E5_DIMS;
  private extractor: Promise<Extractor> | null = null;
  private isLoaded = false;
  private readonly batchSize: number;
  private readonly loader: ExtractorLoader;

  constructor(private readonly options: TransformersEmbeddingOptions) {
    this.batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH);
    this.loader = options.loader ?? loadTransformersExtractor;
  }

  /** True once the model has loaded. */
  get loaded(): boolean {
    return this.isLoaded;
  }

  async embed(texts: string[], kind: "query" | "passage"): Promise<Result<number[][]>> {
    if (texts.length === 0) return ok([]);
    const extractor = await this.load();
    if (!extractor.ok) return extractor;

    const prefix = E5_PREFIX[kind];
    const out: number[][] = [];
    try {
      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize).map((t) => prefix + clean(t));
        const tensor = await extractor.value(batch, { pooling: "mean", normalize: true });
        const rows = tensor.tolist();
        if (!isMatrix(rows, batch.length, this.dims)) {
          return err(
            appError("llm_bad_output", `The search model returned vectors of the wrong shape.`),
          );
        }
        out.push(...rows);
      }
    } catch (e) {
      return err(appError("llm_unavailable", "The search model failed to read this text.", e));
    }
    return ok(out);
  }

  private async load(): Promise<Result<Extractor>> {
    this.extractor ??= this.loader(this.model, this.options.cacheDir);
    try {
      const ex = await this.extractor;
      this.isLoaded = true;
      return ok(ex);
    } catch (e) {
      this.extractor = null;
      return err(
        appError(
          "llm_unavailable",
          `Could not load the search model (${this.model}, about 120 MB, downloaded once). Check the internet connection and try again; until then search matches keywords only.`,
          e,
        ),
      );
    }
  }
}

/** Collapses whitespace; e5 does not need line breaks and they waste tokens. */
const clean = (t: string) => t.replace(/\s+/g, " ").trim();

function isMatrix(rows: unknown, n: number, dims: number): rows is number[][] {
  return (
    Array.isArray(rows) &&
    rows.length === n &&
    rows.every((r) => Array.isArray(r) && r.length === dims && typeof r[0] === "number")
  );
}

/** Production loader: quantized (q8) ONNX weights, cached on disk, CPU. */
export const loadTransformersExtractor: ExtractorLoader = async (model, cacheDir) => {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = cacheDir;
  env.allowLocalModels = false;
  const pipe = await pipeline("feature-extraction", model, {
    dtype: "q8",
    device: "cpu",
    cache_dir: cacheDir,
  });
  return (texts, options) => pipe(texts, options);
};
