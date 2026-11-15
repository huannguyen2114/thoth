# ADR-NNNN: Chat source context: whole source under 150k tokens, else FTS top-k

- Status: Proposed
- Date: 2026-11-15

## Context

Chat answers must cite exact pages or times. Small sources fit in the prompt; long ones do not.

## Decision

We send every segment, each prefixed with its citation token, when the estimated size (chars / 4) is at most 150k tokens. Above that we send the FTS5 top-30 segments for the question plus the previous question, in source order, falling back to evenly spread segments when search finds nothing. Paragraph tokens are 1-based segment indexes.

## Consequences

Simple, cacheable context for most sources; long sources lose global questions' coverage. Embeddings can replace FTS later behind the same function.

## Alternatives considered

- Always retrieve: worse answers on short sources.
- Embeddings now: new dependency and adapter before it is needed.
