# Decision records (ADRs)

This folder records **why** Thoth is built the way it is. Each file is one Architecture Decision Record (ADR).

## Rules (append-only)

1. **Never edit the body of an accepted ADR.** It is a historical record.
2. **To change a decision,** add a new ADR that says `Supersedes: ADR-NNNN`.
3. **The only edit allowed on an old ADR** is its `Status:` line. Change it to `Superseded by ADR-MMMM` or `Deprecated`.
4. **Numbers are sequential and never reused.** Use the next free number, 4 digits, kebab-case title: `0013-use-x-for-y.md`.
5. **CI enforces rules 1–3.** `tools/check-adr-append-only.sh` fails a PR that modifies or deletes an existing ADR, unless the only changed line is `Status:`.

## When to write one

Write an ADR when a choice:

- is hard to reverse, such as a framework, storage, or a public interface;
- changes a cross-cutting rule, such as error handling or folder layout; or
- was debated, so a future reader (human or AI) would otherwise re-open it.

Do **not** write one for routine implementation details. Those belong in `technical_design/`.

## Template

```markdown
# ADR-NNNN: <decision in a few words>

- Status: Proposed | Accepted | Superseded by ADR-MMMM | Deprecated
- Date: YYYY-MM-DD
- Supersedes: ADR-XXXX (optional)

## Context

What forces are at play? What problem do we need to solve?

## Decision

What we will do, stated in the active voice ("We use ...").

## Consequences

What becomes easier, what becomes harder, and the follow-ups.

## Alternatives considered

- Option. Why we rejected it.
```

## Index

| #                                                           | Decision                                                                     | Status                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------- |
| [0001](0001-record-architecture-decisions.md)               | Record architecture decisions as append-only ADRs                            | Accepted                   |
| [0002](0002-single-user-local-first-pwa.md)                 | Single-user, local-first, installable PWA                                    | Accepted                   |
| [0003](0003-pnpm-turborepo-monorepo.md)                     | pnpm + Turborepo monorepo with source-only internal packages                 | Accepted                   |
| [0004](0004-hexagonal-architecture.md)                      | Hexagonal architecture: core, ports, adapters, one composition root          | Accepted                   |
| [0005](0005-result-type-for-expected-errors.md)             | `Result` type for expected failures; exceptions only for bugs                | Accepted                   |
| [0006](0006-sqlite-libsql-drizzle.md)                       | SQLite through libSQL and Drizzle ORM                                        | Accepted                   |
| [0007](0007-pwa-manifest-and-handwritten-service-worker.md) | Built-in manifest + a hand-written service worker                            | Accepted                   |
| [0008](0008-llm-provider-port-api-key-and-subscription.md)  | One LLM port with two adapters: API key and Claude subscription              | Accepted (amended by 0013) |
| [0009](0009-hearth-design-system-vendored-tokens.md)        | Hearth design system, vendored, with generated CSS tokens                    | Accepted                   |
| [0010](0010-tooling-biome-vitest-strict-ts.md)              | Biome, Vitest, strict TypeScript 5.9                                         | Accepted                   |
| [0011](0011-nextjs-16-cache-components-server-actions.md)   | Next.js 16 App Router with Cache Components; Server Actions as thin adapters | Accepted                   |
| [0012](0012-feature-folders-in-web-app.md)                  | Feature folders in the web app                                               | Accepted                   |
| [0013](0013-llm-adapter-defaults-and-isolation.md)          | LLM adapter defaults, structured output, subscription isolation              | Accepted                   |

Add a new row when you add an ADR. When you supersede one, change its status here as well.
