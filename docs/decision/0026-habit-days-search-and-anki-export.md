# ADR-0026: Habit days, search composition and Anki export format

- Status: Accepted
- Date: 2026-11-16

## Context

Lane 3 adds the heatmap and streaks, History, global search and export. Three choices are hard to reverse once data and habits depend on them.

## Decision

1. **Day edges come from the browser.** The client passes its timezone offset to Server Actions; core converts instants to local days (`localDay`) and holds the streak rules. The habit views therefore load after mount, behind a skeleton, instead of being rendered on the server. Streaks and the "this week" total use Sunday-first weeks. Today without activity does not break a streak.
2. **Search does not add a new index.** It combines a title and note scan (in memory, over the newest 500 contents and every note) with the existing FTS5 segment search, and orders results by kind (titles, notes, source) and then by score. A new search table is not needed at single-user scale.
3. **Anki export is a CSV with Anki's `#` header lines** (`#separator:Comma`, `#html:false`, `#tags column:3`), columns Front, Back, Tags. Chosen over `.apkg` because it needs no binary writer or dependency and imports on every Anki version.

## Consequences

- Rendering the heatmap needs one extra round trip after load.
- Search will need a real index (FTS over notes and titles) if the library grows to thousands of contents.
- Scheduling data is not exported: an imported card starts as new in Anki.
