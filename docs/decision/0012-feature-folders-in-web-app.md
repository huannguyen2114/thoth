# ADR-0012: Feature folders in the web app

- Status: Accepted
- Date: 2026-11-15

## Context

The roadmap adds many features: spaces, contents, chat, summary, notes, quiz, flashcards and exams. Grouping by technical type (`components/`, `actions/`) scatters each feature across folders.

## Decision

`apps/web/src` has this layout:

- `app/`: **routing only**. Thin pages and layouts compose features. `_components/` holds app-wide chrome, such as the shell and the service worker registration.
- `features/<feature>/`: everything UI-side for one feature: Server Actions (`actions.ts`), server components, client components, and feature-local hooks.
- `server/`: server-only infrastructure: `env.ts` (zod-parsed env) and `container.ts` (the composition root). Both import `server-only`.

Features may import from `@thoth/*` packages and `server/`. Features should not import from each other; shared pieces move to `@thoth/ui` or `@thoth/core`.

## Consequences

- A feature can be found, reviewed or deleted as one folder.
- Cross-feature reuse needs a deliberate move into a package.
