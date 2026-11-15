# ADR-0014: Ingestion pipeline: `@thoth/ingest` adapter, in-process job runner, model-picked chapter starts

- Status: Accepted
- Date: 2026-11-15

## Context

Phase 2 turns PDFs, YouTube videos, web pages and pasted text into segments and chapters. Several choices here are hard to reverse, because later phases and stored data depend on them:

- Parsing needs Node-only libraries (`pdfjs-dist`, `jsdom`, child processes for `yt-dlp`), which `@thoth/core` must not import (ADR-0004).
- Ingestion is slow (network plus an LLM call) and must survive transient failures, without Redis or a second process (ADR-0002).
- Every citation and chapter range must point at real source positions. Locators written now are stored and read by every later feature.
- Contents have no body column, so pasted text needs a home before it is parsed.

## Decision

1. **Parsers are an adapter.** We add the package `@thoth/ingest` (depends on `@thoth/core` only) implementing a new port, `SourceParser` (`packages/core/src/ports/ingest.ts`). The container constructs it in one `ingest` slot. Parse failures return `IngestFailure`, an `AppError` with code `ingest_failed` plus a `retryable` flag.
2. **Jobs run in process.** One runner loop per server process, started from `apps/web/src/instrumentation.ts` (Node runtime, not during `next build`), claims jobs from the `jobs` table one at a time. The retry policy lives in core (`processNextJob`): at most 3 attempts, with 15 s and 60 s backoff, for retryable failures only.
3. **Chapters are anchored to segments.** The `chapters` prompt shows numbered segments, and the model returns only `startSegment`, a title and a summary per chapter. Core computes each chapter's locator from the segments it spans. Long sources are chaptered in windows of about 100,000 characters.
4. **Locator conventions.**
   - PDF: one segment per page with text, `{ type: "page" }`.
   - YouTube: caption cues grouped into 30–90 s segments, `{ type: "time" }`.
   - Web and text: paragraphs, `{ type: "offset" }`. For pasted text the offsets index the text exactly as submitted (CRLF included); for web pages they index the extracted article text.
5. **Pasted text lives in the job payload** until the job writes it as segments. A retry re-uses the saved segments.
6. **Live status is polled.** Recents calls `router.refresh()` every 2 s while any content is queued or processing, instead of the SSE planned in 03-ingestion.md.

## Consequences

- Swapping a parser library touches `packages/ingest` only. Use cases are tested with a fake `SourceParser`.
- A crash during a job leaves it `running`. At merge the orchestrator added `JobRepository.requeueRunning()`, which the runner calls once at startup, so an interrupted job runs again.
- The model cannot invent timestamps or pages; a bad start index is dropped, not stored.
- Offsets for web pages do not map back to the original HTML. A reader view for web content must render the stored segments, not the live page.
- Pasted text that fails before it is parsed cannot be retried without pasting it again. This is rare, because text parsing is local and only fails on empty input, which validation already rejects.
- Polling costs one request per 2 s only while something is processing. SSE can replace it later without changing the use cases.

## Alternatives considered

- **Parsers inside `apps/web`:** fewer packages, but parser tests would need the Next.js toolchain, and a future Chrome extension could not reuse them.
- **A separate worker process or a queue library:** more robust across restarts, but more moving parts than a single-user app needs.
- **Let the model return timestamps or pages directly:** simpler prompt, but the values can be invented or misformatted.
- **A `body` column on contents for pasted text:** cleaner retries, but it is a schema change, which Lane A may not make.
