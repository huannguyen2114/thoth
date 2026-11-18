# ADR-0028: End-to-end browser tests with Playwright and a scripted LLM, run in CI

- Status: Accepted
- Date: 2026-11-18

## Context

Every phase so far was verified by hand in the browser. Regressions across features (a Learn tool inside the dock, citations jumping the viewer) are exactly what hand testing misses later. CI has no Claude subscription and must not spend API money, and LLM output is not deterministic.

## Decision

1. **Playwright** (Chromium) end-to-end tests live in `apps/web/e2e/` and run with `pnpm test:e2e`.
2. **Scripted LLM mode.**
   - When `THOTH_LLM=scripted`, the container uses `ScriptedLlmProvider` (`packages/llm/src/scripted-provider.ts`) instead of the saved provider.
   - It returns deterministic, schema-valid replies per task (chapters, summary, quiz, flashcards, grading, chat, mind map, whiteboard) built from the request's source text, so citations point at real segments.
   - It is never selectable in the UI.
3. **Isolation:** each run uses a fresh `THOTH_DATA_DIR` (a temp folder) and the seed, and the server is started by Playwright's `webServer` on `127.0.0.1`.
4. **CI:** a separate `e2e` job installs the Playwright Chromium browser, builds, and runs the suite. On failure it uploads the HTML report and traces as artifacts.
5. **What the suite covers:** the main journeys (add content, workspace and chat with a citation jump, each Learn tool, quiz, exam, review, planner, whiteboard, search, history), plus the theme and the phone layout. It does not cover provider quality: the live tests in `packages/llm/src/live.test.ts` do that.

## Consequences

- **Every new feature adds or extends an e2e journey** (rule added in `docs/technical_design/06-quality-and-workflow.md`).
- The scripted provider must learn each new task's schema. A missing task fails loudly.
