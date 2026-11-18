# ADR-0029: Local embeddings in libSQL vectors, hybrid retrieval with FTS5

- Status: Accepted
- Date: 2026-11-18
- Amends: ADR-0006 (no vector database), ADR-0015 (chat context for large sources)

## Context

Keyword search (FTS5 BM25) misses questions phrased differently from the source, which hurts chat on large sources (ADR-0015), exams on many contents, and Cmd+K search. Claude has no embeddings API. The owner chose a free, local model.

## Decision

1. **Model:** `Xenova/multilingual-e5-small`, 384 dimensions, through `@huggingface/transformers` (Transformers.js, ONNX, CPU).
   - It is multilingual, so Vietnamese and English work.
   - It is downloaded once on first use into `<THOTH_DATA_DIR>/models`.
   - e5 prefixes: `query: ` for questions and `passage: ` for segments.
2. **Storage:** libSQL's built-in vectors.
   - A `segment_vectors` table: `segment_id` primary key with cascade delete, `content_id`, and `embedding F32_BLOB(384)`.
   - A `libsql_vector_idx` index queried with `vector_top_k`.
   - There is no extension and no separate vector database.
3. **Ports:**
   - `EmbeddingProvider` (`embed(texts, kind)`) is implemented in a new `@thoth/embeddings` package.
   - `VectorRepository` (`upsert`, `search`, `missingSegments`, `deleteForContent`) is implemented in `@thoth/db`.
4. **Indexing:**
   - An `embed` job runs after each ingest finishes.
   - A backfill embeds segments that have no vector yet.
   - Both are batched and never block ingestion: a content is `ready` before its vectors exist.
5. **Hybrid retrieval:** a core use case runs FTS5 and vector search and merges them with reciprocal rank fusion (k = 60). It is used by:
   - chat context when the source is too large to send whole (ADR-0015);
   - exam source sampling across contents;
   - Cmd+K search.
     When vectors are missing it falls back to FTS alone.

## Consequences

- The first semantic query after install waits for the model download (about 120 MB on disk). The UI says so.
- Changing the model later means re-embedding: keep the model id with the vectors and re-embed when it changes.
