# ADR-0032: How the end-to-end suite is shaped

- Status: Accepted
- Date: 2026-11-18
- Extends: ADR-0028

## Context

ADR-0028 decided that Playwright runs against a scripted LLM. Building it left a few choices that are cheap now and costly to change once many specs exist.

## Decision

1. **One worker, one server, shared database, independent specs.** Specs run serially against one server. Each spec creates the data it needs under a unique name and asserts only on that data. This keeps the suite fast (no server per worker) and makes retries safe.
2. **Spec files are named `*.e2e.ts`** and live in `apps/web/e2e/`, so Vitest's default pattern in the same package never collects them.
3. **The scripted provider recognises prompts by their opening words** and validates its reply with the caller's real zod schema. An unknown task or prompt is an `llm_unavailable` error. Its unit tests build prompts with the real prompt functions, so a prompt rewrite fails there first.
4. **The gate smoke test asserts only mode-independent behaviour.** On `next dev` and `next start` a forged `x-forwarded-for: 127.0.0.1` cannot be told from the real one (doc 14), so the test checks that a remote-looking address gets no data, not that a forged loopback one is refused. Trusted mode stays covered by unit tests.
5. **CI serves the production build** (`next start`) and keeps the dev server for local runs, so CI also proves the build boots and serves every route.

## Consequences

- A new feature adds a journey and, if it adds an LLM task, a scripted reply. Specs must not rely on data from other specs.
- Moving to parallel workers later needs a data folder and server per worker; nothing else changes.
