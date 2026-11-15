# Thoth

Thoth is a personal, local-first study app. Add a PDF, a YouTube lecture or a web page, and Thoth turns it into chapters, a chat with citations, summaries, notes, quizzes, spaced-repetition flashcards and timed exams.

It runs on your own machine and uses your own Anthropic API key **or** your Claude subscription (through headless Claude Code). It is installable as a PWA.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm check        # lint + typecheck + test
```

Requirements: Node 22 or newer, and pnpm 12.

## Docs

- [docs/README.md](docs/README.md): where everything is.
- [Architecture](docs/technical_design/01-architecture.md)
- [Decisions (ADRs)](docs/decision/README.md)
- [Roadmap](docs/plan/roadmap.md)
- [Hearth design system](design/hearth/README.md)
