# ADR-0034: Planner pacing, the exam day and the rest day

- Status: Accepted
- Date: 2026-11-18

## Context

ADR-0030 fixes the planner's rules in outline. Building it needed choices that are hard to change once plans exist: how work is spread over the days, where the exam goes, and how "not enough time" is reported.

## Decision

1. **Pacing.** The daily target is the mandatory minutes divided by the study days before the exam, times 1.3. A second sweep ignores the target, so pacing never causes a false "not enough time". A 3-week goal therefore gives about 20 minutes of new work a day, not three full days followed by nothing.
2. **The exam** is three days before the goal (two if that is not a study day) and is reserved before other work. Chapters must be learned a study day before their quiz, and quizzes cannot use an exam day the exam fills.
3. **The rest day** is the day before the goal, a `rest` item with 0 minutes. Nothing else is scheduled on it, and the goal day is empty.
4. **Not enough time** never crams. Items that do not fit are left out and a `Shortfall` carries the missing minutes and the smallest daily budget (steps of 5) that fits, which the UI offers as one tap.
5. **Re-planning** counts finished items against their day, never reschedules them, and schedules the rest from today.

## Consequences

- Plans are deterministic and explainable; the constants live in `build-plan.ts` and are covered by tests.
- Changing a constant changes new plans only; existing items stay until the next re-plan.
- Time estimates remain rough (800 characters a minute, a flat 8 minutes per quiz).
