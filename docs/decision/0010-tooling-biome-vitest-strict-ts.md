# ADR-0010: Biome, Vitest, strict TypeScript 5.9

- Status: Accepted
- Date: 2026-11-15

## Decision

- **Biome** (`biome.json`) is the single linter and formatter for TS, TSX, JSON and CSS. Next.js 16 no longer runs ESLint during build. Biome is one fast tool with Next and React rule domains.
- **Vitest** for unit and integration tests. Each package has a `test` script, and Turborepo runs them all.
- **TypeScript 5.9** with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`, from `@thoth/tsconfig/base.json`. TypeScript 7 (native) is not adopted yet, until the Next.js plugin supports it.
- **One gate:** `pnpm check` runs lint, then typecheck, then test. CI runs it plus `pnpm build`.

## Consequences

- Format on save gives a consistent style, and agents run `pnpm format`.
- `exactOptionalPropertyTypes` sometimes needs `?: T | undefined`. That cost is accepted for fewer undefined bugs.
