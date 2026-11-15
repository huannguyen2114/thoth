# ADR-0004: Hexagonal architecture: core, ports, adapters, one composition root

- Status: Accepted
- Date: 2026-11-15

## Context

Several parts are likely to change:

- the LLM provider (API key vs subscription vs future providers);
- storage (SQLite now, maybe something else later);
- the delivery surface (web, extension).

We want those changes to touch one adapter, not the whole codebase.

## Decision

We use **ports and adapters**:

- **`@thoth/core`** holds domain types, use cases and **ports** (interfaces such as `LlmProvider` and `SpaceRepository`). It depends only on `zod`. It has **no** framework, database or SDK imports.
- **Adapters** implement the ports:
  - `@thoth/db` implements repositories with Drizzle.
  - `@thoth/llm` implements `LlmProvider`.
- **`@thoth/ui`** holds presentational React components and the Hearth styles. It has no data access.
- **`apps/web`** is a delivery adapter.
  - Its **one composition root** is `apps/web/src/server/container.ts`, the only file that constructs adapters.
  - Server Actions and route handlers call use cases with the container's ports.

**Allowed dependency edges:**

- `web → core, db, llm, ui`
- `db → core`
- `llm → core`
- `ui → (none)`
- `core → (none)`

## Consequences

- **Use cases are unit-tested with in-memory fakes** (see `packages/core/src/usecases/spaces.test.ts`).
- **Swapping an adapter is a change to `container.ts` only.**
- There is a little more ceremony: each new capability needs a port, an adapter and a use case.

## Alternatives considered

- Calling Drizzle and the Anthropic SDK directly from React Server Components. Fast to write, but it couples the UI to infrastructure and makes the two LLM providers hard to swap.
