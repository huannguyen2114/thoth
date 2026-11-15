# ADR-0017: Quiz grading rules and FSRS scheduling with `ts-fsrs` in core

- Status: Accepted
- Date: 2026-11-15
- Amends: ADR-0004 (the "core depends on zod only" rule)

## Context

Phases 5 and 6 store quiz attempts and flashcard schedules. How answers are graded and how schedules advance shape stored data and what the owner sees, so they are hard to reverse. Scheduling needs a well-tested FSRS implementation, but ADR-0004 allows `@thoth/core` to depend only on `zod`.

## Decision

1. **One quiz set per topic (chapter); one flashcard set per request.**
   - Quiz titles are "Quiz N: {chapter title}". "Generate more" repeats the stored options for the same topic.
   - Each flashcard carries its chapter title as `topic`.
2. **Grading.**
   - Multiple choice, true/false and fill in the blank are all-or-nothing. Fill in the blank compares answers after normalising case, accents, punctuation, spacing and a leading article.
   - Multi select scores `(right picks − wrong picks) / right answers`, floored at 0, and counts as correct only for the exact set.
   - Free response is scored 0..1 by the model (task `grading`) against a rubric written at generation time. A score of 0.7 or more (`FREE_RESPONSE_PASS`) counts as correct.
   - Every attempt is stored. Topic strength uses the latest attempt per question.
3. **FSRS through `ts-fsrs`, fuzz off.**
   - Same state and clock give the same schedule. Learning steps are 1 minute, then 10 minutes.
   - `FsrsState` has no learning-step column. The step is recovered from the last interval: a Learning card whose last interval was at least 10 minutes is on step 2.
   - A card due again within 20 minutes stays in the current review session.
4. **Core may depend on pure libraries.** `ts-fsrs` is a dependency of `@thoth/core`. This amends ADR-0004: core may depend on a library only if it is **pure** (no I/O, no globals, no framework), small, and imported in one module (here `usecases/flashcards/fsrs.ts`). Each such library needs an ADR.

## Consequences

- Free-response grading costs one model call per answer. It is the only per-answer cost.
- The learning-step recovery is a heuristic. It is exact for the default steps and covered by `fsrs.test.ts`. If FSRS settings ever become configurable, add a column in a new migration.
- Offline review through the service worker is still deferred (ADR-0007).
