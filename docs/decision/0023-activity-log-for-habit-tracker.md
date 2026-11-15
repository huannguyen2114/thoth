# ADR-0023: Activity log for the habit tracker

- Status: Accepted
- Date: 2026-11-15

## Context

The owner wants a GitHub-style heatmap of daily study, with streaks. Most study actions already leave timestamps (quiz attempts, reviews, chat messages, exam sessions), but note editing keeps only the last edit time. Computing the heatmap from seven tables on every read also spreads one feature's rules across many queries.

## Decision

1. **A new `activity_events` table**: `id`, `kind`, `at` (epoch ms), `ref` (the related id).
   - Kinds: `quiz_answer`, `card_review`, `chat_question`, `note_edit`, `content_added`, `exam_submitted`, `summary_generated`.
   - It is written through a new `ActivityRepository` port by the use cases that perform the action.
2. **`note_edit` is throttled** to at most one event per content per hour, so autosave does not flood the log.
3. **The migration backfills** the table from existing data: quiz attempts, reviews, user chat messages, contents, submitted exams, ready summaries, and the last edit of each note.
4. **Days are local calendar days**, computed in the use case from the client's timezone offset, so the heatmap matches the owner's day.

## Consequences

- The heatmap and streaks are one grouped query.
- Every new study action must record an event. The rule is in `docs/technical_design/06-quality-and-workflow.md`.
