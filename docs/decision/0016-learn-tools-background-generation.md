# ADR-0016: Learn tools generate in the background with `after()`, and panels poll

- Status: Accepted
- Date: 2026-11-15

## Context

Summaries, quizzes and flashcards can each take a minute or more to generate. Learn tools talk to the server through Server Actions (the Learn-panel contract). A Server Action cannot stream to the client, and Next runs one Server Action at a time per client, so holding one open for a whole generation would block every other action on the page. Lanes C and D reached the same answer independently (their drafts are merged here).

## Decision

1. **Two steps.**
   - A `start…` use case validates the options and creates the `StudySet` with `status: "generating"`.
   - The Server Action schedules the slow `run…` step with `after()` from `next/server`, then returns at once.
2. **The run step writes progress to the set.**
   - Summaries stream through `LlmProvider.streamText` and save the growing Markdown into `study_sets.body` at most once per second.
   - Quizzes and flashcards save their items when the model returns.
   - Every run ends by setting `ready`, or `failed` with an error message on the set.
3. **Panels poll** their list action while any set is `generating`: summaries every 1.5 s, quizzes and flashcards every 3 s.
4. **Stuck sets.**
   - Summaries mark a set that has been `generating` for more than 15 minutes as `failed`.
   - Quizzes and flashcards currently leave a stuck set for the owner to delete. **Follow-up:** apply the same 15-minute rule there.

## Consequences

- Generation survives closing the tab or navigating away. Failures stay visible after a reload.
- Progress is up to one poll interval behind the model.
- Work started by `after()` is lost if the server process dies. The stale-set rule reports that honestly instead of hanging forever.
- Ingestion (ADR-0014) uses the `jobs` table instead, because it must survive restarts and retry. If Learn-tool generation ever needs the same, move it onto jobs without changing the use cases.

## Alternatives considered

- **A streaming route per tool:** routes belong in `app/api/**`, and polling was good enough for a single user.
- **The `jobs` table:** more robust, but only Lane A owned jobs during parallel work. Revisit if restarts lose real work.
