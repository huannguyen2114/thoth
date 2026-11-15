# ADR-0003: pnpm + Turborepo monorepo with source-only internal packages

- Status: Accepted
- Date: 2026-11-15

## Context

The roadmap adds surfaces later: a Chrome extension (Phase 12), possibly a CLI or worker. These must share domain logic, LLM adapters and the design system without copy-paste.

## Decision

- Use **pnpm workspaces** with **Turborepo** for task orchestration and caching.
- The layout is `apps/*` (deployables) and `packages/*` (libraries).
- Internal packages are **source-only**. They export `./src/index.ts` directly, with no build step. Next.js compiles them via `transpilePackages`, and Vitest runs them directly.
- Package names use the `@thoth/` scope. Dependencies on each other use `workspace:*`.
- Shared TypeScript settings live in `@thoth/tsconfig`.

## Consequences

- A new app (an extension, for example) imports `@thoth/core` and `@thoth/llm` immediately.
- There is no per-package `dist/` to keep in sync, and no watch builds.
- Any consumer must be able to compile TypeScript. If a package is ever published, it gets a build step then.
- **Dependency direction is enforced by convention and review.** See ADR-0004 for the allowed edges.

## Alternatives considered

- A single Next.js app with folders. Simpler today, but extracting packages later means a large refactor.
- Nx. More features than one developer needs.
- npm or yarn workspaces. pnpm is stricter about phantom dependencies and faster.
