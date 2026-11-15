# ADR-0011: Next.js 16 App Router with Cache Components; Server Actions as thin adapters

- Status: Accepted
- Date: 2026-11-15

## Context

Next.js 16 enables **Cache Components** and **Partial Prefetching**. Pages prerender a static shell, and uncached data must sit inside `<Suspense>`. Its APIs differ from older Next.js versions. Read `apps/web/node_modules/next/dist/docs/` before using an unfamiliar API (see `apps/web/AGENTS.md`).

## Decision

- **Reads.** Async Server Components that read local data call `await connection()` and render inside `<Suspense>` with a Hearth skeleton fallback. The page shell stays static (Partial Prerender).
- **Writes.** Server Actions (`"use server"`) are **thin adapters**. They parse `FormData`, call a core use case with ports from `getContainer()`, map the `Result` to UI state, then call `refresh()`. No business rules live in actions.
- **Streaming LLM output** (Phase 3 and later) uses Route Handlers that return Server-Sent Events. Server Actions are not built for long-lived streams.
- Client Components use `useActionState` for forms and are kept small.

## Consequences

- Fast shells, and offline-friendly prefetching (ADR-0007).
- Every DB-backed component needs a Suspense boundary. Forgetting one fails the build, which is a useful guard.
