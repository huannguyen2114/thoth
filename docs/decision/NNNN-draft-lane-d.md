# ADR-NNNN (draft, Lane D): Quiz and flashcard generation, grading and FSRS scheduling

- Status: Proposed (draft; the orchestrator assigns the number at merge)
- Date: 2026-11-15
- Supersedes: none

## Context

Phases 5 and 6 add AI-written quizzes and spaced-repetition flashcards. Three choices are hard to reverse because they shape stored data and user-visible behaviour: how generation runs, how answers are graded, and how FSRS state is stored and advanced.

## Decision

1. **Generation is two steps, and the slow one runs after the response.**
   - A Server Action calls `start…Generation`, which validates the options and creates the study set(s) with `status: "generating"`. It returns at once.
   - `after()` from `next/server` then calls `run…Generation`, which asks the model and flips the set to `ready` or `failed` (with the error saved on the set).
   - The panel polls every 3 seconds while a set is generating.
   - Why: a quiz per topic can take about a minute each. Holding the dialog open that long is a bad experience, and a failure must survive a page reload. No job table is used, because Lane A owns jobs.
   - A server restart during generation leaves a set stuck on "Generating". The owner deletes it and generates again.
2. **One quiz set per topic (chapter); one flashcard set per request.** Quiz titles are "Quiz N: {chapter title}", where N counts the content's quiz sets. "Generate more" repeats the stored options for the same topic. Flashcards use one request across the chosen chapters, and each card carries its chapter title as `topic`.
3. **Grading is deterministic for objective types and model-graded for free response.**
   - multiple choice, true/false and fill in the blank are all-or-nothing. Fill in the blank compares after normalising case, accents, punctuation, spacing and a leading article.
   - multi select earns `(right picks − wrong picks) / right answers`, floored at 0. It counts as correct only for the exact set.
   - Free response is scored 0..1 by the model (task `grading`) against a rubric written at generation time. A score of 0.7 or more counts as correct (`FREE_RESPONSE_PASS`).
   - Every attempt is stored. Topic strength uses the latest attempt per question, so a retry replaces an old score.
4. **FSRS through `ts-fsrs`, with fuzz off.**
   - `ts-fsrs` is a dependency of `@thoth/core`. It is a pure library with no I/O. Only `usecases/flashcards/fsrs.ts` imports it.
   - Fuzz is disabled so a state and a clock always give the same schedule. Short-term learning steps stay on (1 minute, then 10 minutes), so "Again" returns in a minute.
   - The stored `FsrsState` has no `learning_steps` column, which ts-fsrs needs. It is recovered from the last schedule: a Learning card whose previous interval was 10 minutes or more is on step 2. This avoids a schema change. If FSRS settings ever become configurable, add the column in a new migration.
   - A card that comes due again within 20 minutes stays in the current review session.

## Consequences

- Quiz and flashcard sets can be seen as "Generating" or "Failed" in the list, and nothing is lost on reload.
- Free-response grading costs one model call per answer. It is the only per-answer cost.
- The learning-step recovery is a heuristic. It is covered by tests (`fsrs.test.ts`) and is exact for the default steps.
- Offline review (service worker) is deferred. Reviews need the server to save the schedule.
