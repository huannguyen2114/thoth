# ADR-0048: The app frame moves into a shared layout

- Status: Accepted
- Date: 2026-11-22
- Builds on: ADR-0020, ADR-0047

## Context

Every page rendered its own `AppShell`, so moving between pages unmounted the sidebar and mounted a new one. That made the redesign's current-page pill (ADR-0047) spring in afresh on each page instead of sliding from the old item, and it re-ran the sidebar's data on every navigation.

The redesign also left a few things plain:

- the dock's tabs had a static underline;
- a citation jump only tinted its target briefly;
- planner, history, settings and exam pages had no colour.

## Decision

1. **A route group.** Every page with the sidebar lives in `apps/web/src/app/(shell)/`. Its `layout.tsx` renders `AppFrame` once: the sidebar, the palette, search and the scrolling `.app-main`. URLs do not change. Unlock, offline and dev pages stay outside the group, with no frame.
   - A page wraps its body in `AppPage`: padded, with the page-enter motion, or `bleed` for the content workspace and spaces.
   - While spaces load, the frame shows a sidebar skeleton that reads no pathname, so dynamic routes still prerender their static shell. `SearchProvider` sits in its own `<Suspense>` for the same reason.
   - The sidebar stays mounted, so the pill's shared `layoutId` slides it between items.
2. **Sliding dock tab underline.** dockview owns the tab DOM, so `features/workspace/tab-ink.ts` places one extra element in each group header and moves it under the active tab. A CSS transition with a spring-like curve slides it; it is accent in the active group.
3. **The source pulses where a jump lands.** `flash()` in the viewer context now plays a one-time pulse: a tint for rows and paragraphs, and a ring for PDF pages and the video. With reduced motion it is a static tint or outline.
4. **Every page opens with its colour.** `PageHeader` gives each page the sidebar tile's tone, larger, with a serif title. History rows get a tone by activity (`features/history/activity-tone.ts`). Plans are butter, and the exam's intro and result cards are sage, with a score ring.

## Consequences

- The sidebar's spaces load once per session, not once per page. A server action that changes spaces must still revalidate, so the layout's data refreshes.
- Pages no longer import a frame. A new page with the sidebar goes in `(shell)/` and uses `AppPage`.
- Paths in docs that pointed at `app/<page>/` now point at `app/(shell)/<page>/`.
