# Thoth: agent guide

Thoth is a single-user, local-first study PWA. It is a personal alternative to YouLearn. It turns PDFs, YouTube videos and web pages into chat, summaries, notes, quizzes, flashcards and exams. The LLM is either the owner's Anthropic API key or their Claude subscription, through headless Claude Code.

## Read before you grep (in this order)

1. `docs/README.md`: map of the docs and the writing rules.
2. `docs/technical_design/01-architecture.md`: packages, dependency rules, request flow, repo layout.
3. `docs/decision/README.md`: index of ADRs. Open the ADRs relevant to your task. **They are binding.**
4. The topic doc in `docs/technical_design/` for the area you are touching:
   - LLM: `02`
   - ingestion: `03`
   - database: `04`
   - UI and Hearth: `05`
   - tests and CI: `06`
   - content page and chat: `07`
   - summary and notes: `08`
   - quiz and flashcards: `09`
   - exams, spaces and progress: `10`
   - app shell and native feel (read before any UI work): `11`
   - app shell and native feel (read before any UI work): `11`
5. `docs/plan/roadmap.md`: what phase we are in and what comes next.

Only then search the code. Most "where is X" questions are answered by `01-architecture.md`.

## Non-negotiable rules

- **Architecture (ADR-0004).**
  - `@thoth/core` imports only `zod` and pure libraries approved by an ADR (today: `ts-fsrs`, ADR-0017).
  - Only `apps/web/src/server/container.ts` constructs adapters.
  - Server Actions are thin. Business rules belong in core use cases.
- **Errors (ADR-0005).** Expected failures return `Result`. Throw only for bugs.
- **Decisions (ADR-0001).** `docs/decision/` is **append-only**.
  - Never edit an accepted ADR's body.
  - To change a decision, add the next-numbered ADR with `Supersedes:`, and update only the old ADR's `Status:` line and the index.
  - Add an ADR for any hard-to-reverse choice you make.
- **Design (ADR-0009).**
  - All UI uses Hearth tokens and utilities (`bg-surface-200`, `text-ink`, `type-heading-2`). No hex colors and no arbitrary sizes.
  - Read `design/hearth/README.md` and the component's guideline in `design/hearth/components/<Comp>/README.md` first.
  - `design/hearth/` and `packages/ui/src/styles/{tokens,theme,components}.css` are generated or vendored. Do not hand-edit them.
- **Next.js 16 (ADR-0011).** APIs differ from older versions. Read `apps/web/node_modules/next/dist/docs/` before using an unfamiliar API. DB reads go inside `<Suspense>`, after `await connection()`.
- **Docs stay current.** When you change behaviour, update the matching `docs/technical_design/*.md` in the same change.

## Commands (repo root)

- `pnpm dev`: start the web app.
- `pnpm check`: lint, typecheck and test. Run it before saying work is done.
- `pnpm format`: Biome auto-fix.
- `pnpm build`: production build.
- `pnpm --filter @thoth/db db:generate`: create a migration after a schema change.
- `pnpm --filter @thoth/ui tokens`: regenerate the Hearth CSS.

## Environment notes (owner's Mac)

- Use `/opt/homebrew/bin/git`. `/usr/bin/git` and `python3` are Xcode stubs that fail until `sudo xcodebuild -license` is accepted.
- pnpm 12 is installed globally. Node is 26 locally, and CI uses 22 (`.nvmrc`).
- Runtime data lives in `data/` (git-ignored). Secrets go in `apps/web/.env.local` (see `.env.example`).
