# ADR-NNNN: Background search indexer, Cmd+K distance cut-off and keyword fallbacks

- Status: Draft (Phase 9, Lane 2; the orchestrator numbers it at merge)
- Date: 2026-11-18
- Builds on: ADR-0029 (local embeddings, hybrid retrieval), ADR-0014 (job runner)

## Context

ADR-0029 chose the model, the vector store and RRF. Building it raised four questions it left open:

1. The job runner runs one job at a time. The first embed waits for a 135 MB download; a big library takes minutes. Running embeds as normal jobs would hold up the next ingest.
2. Vector search always returns the nearest passages, even for nonsense, so Cmd+K would list random passages for a typo.
3. A query needs the model. The first query after install may wait for the download, and the model can fail offline.
4. Transformers.js pulls in `onnxruntime-node` and `protobufjs`, whose install scripts pnpm blocks by default.

## Decision

1. **The `embed` job is a signal; a separate in-process indexer loop does the work.** `runIngestJob` enqueues `embed {contentId}` after `ready`. `processNextJob` completes it and calls `IngestDeps.onEmbedJob`, which wakes the indexer (`apps/web/src/server/jobs/indexer.ts`). The indexer embeds `missingSegments` 32 at a time until none are left, then sleeps up to 10 minutes. Its first pass at startup is the backfill. A model failure pauses it 5 minutes and shows on the settings line.
2. **Cmd+K drops vector hits with cosine distance above 0.205** (`SEMANTIC_MAX_DISTANCE`). Measured on the sample contents, relevant English and Vietnamese queries scored 0.09–0.202 and unrelated ones 0.207–0.25. Chat and exam sampling use no cut-off.
3. **Retrieval never fails because of vectors.** Without a provider, without vectors, on a model error, a vector-index error or a slow model (10 s; 3 s in Cmd+K) it returns FTS alone, with `mode: "fts"` and the reason. The model error reuses `llm_unavailable`; there is no embeddings-specific `AppErrorCode`.
4. **Install scripts stay off** (`allowBuilds: onnxruntime-node: false, protobufjs: false`). The npm packages already contain the macOS and Linux CPU binaries; the scripts only fetch CUDA builds and a protobuf CLI.
5. **Browser tests use `FakeEmbeddingProvider`** (word hashing) when `THOTH_LLM=scripted`, so CI never downloads the model.

## Consequences

- Ingestion and the UI never wait for embeddings, and the `jobs` table shows `embed` as done before its vectors exist. The settings line is the place to see progress.
- The cut-off margin is thin (0.202 vs 0.207). A different model or very different libraries may need it re-measured; doc 16 lists the numbers.
- The indexer and request-time queries share one ONNX session. During a large backfill, queries are slower.

## Alternatives considered

- **Embed in the job runner, one batch per job, re-enqueuing itself.** Simpler bookkeeping, but the first job blocks ingest for the whole download.
- **A worker thread or child process for the model.** Isolates CPU use, but adds IPC and a second model copy in memory for one user. Revisit if queries during backfill feel slow.
- **A relative cut-off** (keep hits near the best one). Unrelated queries have a nearest passage too, so it does not hide nonsense.
