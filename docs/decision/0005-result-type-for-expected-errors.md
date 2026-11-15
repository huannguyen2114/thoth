# ADR-0005: `Result` type for expected failures; exceptions only for bugs

- Status: Accepted
- Date: 2026-11-15

## Context

Many failures in Thoth are expected: invalid input, a YouTube video with no transcript, an LLM returning malformed JSON, an unreachable provider. Thrown exceptions hide these in function signatures, and the UI forgets to handle them.

## Decision

- Use cases and ports return `Result<T, AppError>` (`packages/core/src/shared/result.ts`) for **expected** failures.
- `AppError` has a closed `code` union and a user-facing `message` that follows Hearth's voice: say what to do next.
- **Throw only for programmer errors** and unrecoverable infrastructure faults, for example a missing database file. Next.js error boundaries catch those.
- Validate all external input with **zod** at the use-case boundary.

## Consequences

- TypeScript forces callers to handle failure (`if (!r.ok)`).
- Adding a new error code is a deliberate change to one union.
- Results must be unwrapped, which takes a little more code than `try/catch`.
