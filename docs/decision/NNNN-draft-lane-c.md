# ADR-NNNN (draft, Lane C): Summaries generate in the background and the panel polls

- Status: Proposed
- Date: 2026-11-15

## Context

A Summary can take a minute or more. The Learn panel contract gives tools Server Actions, and a Server Action cannot stream a response to the client. A streaming route handler would live in `app/api/**`, which Lane B owns. Holding one Server Action open for the whole generation would also block the other actions from the same client, because Next runs them one at a time.

## Decision

1. `startSummary` creates the `StudySet` (`status: "generating"`) and returns it with a `run()` function. The Server Action schedules `run` with `after()` and returns at once.
2. `run()` consumes `LlmProvider.streamText` and writes the growing Markdown into `study_sets.body` at most once per second, then sets `ready` or `failed`.
3. The panel polls `listSummariesAction` every 1.5 s while any set is `generating` and renders `body` as it grows.
4. `listSummaries` marks a set that has been `generating` for more than 15 minutes as `failed`, so a server restart cannot leave one stuck.
5. Citation tokens in the Markdown are turned into links (`#cite:p.3`) before rendering with `react-markdown`, and the link renderer shows them as chips that call `onCite`.

## Consequences

- No new route, schema or port. Generation survives closing the tab or navigating away.
- Progress is up to 1.5 s behind the model, and costs one extra DB write per second while generating.
- Work started by `after()` is lost if the server process dies. The stale-set rule reports that honestly instead of hanging.
- If a later phase adds a shared streaming route, the panel can switch to it without changing the use case.
