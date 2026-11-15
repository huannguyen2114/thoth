# ADR-0019: Paragraph citations are 1-based everywhere and stored on text locators

- Status: Accepted
- Date: 2026-11-15

## Context

Text and web sources are cited as `[§n]`. The lanes built in parallel disagreed on `n`:

- The chat prompt and the viewer (Lane B) count paragraphs from 1.
- The quiz and summary prompts (Lanes C and D) counted from 0.
- Offset locators held only character offsets, so turning a stored locator back into a token always gave `[§0]`.

The Phase 7 exam test found this: every text citation in exam results, quiz feedback and flashcards linked to the wrong paragraph. Page and time citations were not affected.

## Decision

1. **`n` in `[§n]` is the 1-based paragraph number.** `[§1]` is the first paragraph. This is the same for prompts, model replies, the viewer, deep links (`/content/{id}?at=[§3]`) and stored data.
2. **The offset locator gains an optional `paragraph`** (1-based).
   - `DrizzleSegmentRepository` fills it from the segment's position (`idx + 1`) when it is missing, so data ingested earlier gets it too without a migration.
   - `resolveCitation` returns segment locators, so quiz, exam and flashcard locators store it.
3. **`citationToken(locator)` uses `locator.paragraph`.** `paragraphOf(segment)` in `domain/citation.ts` is the single helper prompts use to number source lines.

## Consequences

- One numbering for every feature, enforced by one helper.
- Quiz, exam and flashcard items generated before this change from text sources have no stored `paragraph`, so their chips show `[§1]`. Regenerate them if that matters. PDF and video items are unaffected.
- Future text locators should keep `paragraph`. The ingest parsers may set it directly instead of relying on the repository default.
