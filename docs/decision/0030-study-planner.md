# ADR-0030: A deterministic study planner that adapts to progress

- Status: Accepted
- Date: 2026-11-18

## Context

The owner wants a plan toward a goal ("exam on 10 December"): what to study each day, built from the material, weak topics and flashcards coming due.

## Decision

1. **A plan** (`study_plans`) has a title, a goal date, minutes per day, study days of the week, and its contents (one space or chosen contents).
2. **Plan items** (`plan_items`) are dated tasks:
   - kinds `learn` (study a chapter), `quiz` (on a topic), `review` (due flashcards), `exam` (a mock exam) and `rest`;
   - each has estimated minutes, a link target, and `done_at`.
3. **Scheduling is a pure, deterministic core function** (unit-tested with a fixed clock), not an LLM call:
   - learn every chapter first, spread by size;
   - interleave quizzes and keep reviews daily;
   - put weak topics (ADR-0018 progress) earlier and repeat them;
   - one mock exam two to three days before the goal;
   - never exceed the minutes per day.
     An optional LLM step may only rename items in a friendlier way.
4. **Re-planning:** "Re-plan" keeps finished items and reschedules the rest from today, using current weak topics. Missed days roll forward.
5. **Today** is shown on the home page and in a `/planner` page. Ticking an item records `plan_item_done` activity (ADR-0023).

## Consequences

- Plans are explainable and testable, and cost no tokens.
- Minute estimates are rough (chapter text length and question counts), and the owner can edit an item.
