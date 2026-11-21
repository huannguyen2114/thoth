# Technical design

This folder describes **how Thoth works today**, plus clearly marked **planned** sections. Each doc starts with a status line. Update a doc in the same change as the code it describes.

| Doc                                                                      | Covers                                                                                     | Status  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------- |
| [01-architecture.md](01-architecture.md)                                 | System context, packages, dependency rules, request flow, repo layout                      | Current |
| [02-llm-providers.md](02-llm-providers.md)                               | The `LlmProvider` port, both adapters, structured output, troubleshooting                  | Current |
| [03-ingestion.md](03-ingestion.md)                                       | Turning PDFs, YouTube and web pages into segments, chapters and search chunks              | Current |
| [04-data-model.md](04-data-model.md)                                     | SQLite schema, migrations, IDs, timestamps                                                 | Current |
| [05-frontend-and-design-system.md](05-frontend-and-design-system.md)     | Next.js 16 patterns, Hearth tokens, components, the PWA                                    | Current |
| [06-quality-and-workflow.md](06-quality-and-workflow.md)                 | Tests, CI, the "add a feature" recipe, conventions for AI agents                           | Current |
| [07-content-page-and-chat.md](07-content-page-and-chat.md)               | Content page, source viewers, Learn panel, chat with citations                             | Current |
| [08-summary-and-notes.md](08-summary-and-notes.md)                       | Summary templates and ranges, notes editor                                                 | Current |
| [09-quiz-and-flashcards.md](09-quiz-and-flashcards.md)                   | Quiz generation and grading, flashcards with FSRS, the review page                         | Current |
| [10-exams-and-progress.md](10-exams-and-progress.md)                     | Spaces, timed exams, results, progress and weak-spot practice                              | Current |
| [11-app-shell-and-feel.md](11-app-shell-and-feel.md)                     | The app frame, sidebar, command palette, shortcuts, and the rules for a native feel        | Current |
| [12-notes-editor.md](12-notes-editor.md)                                 | The live-preview Tiptap notes editor, citation chips, streamed Claude drafts               | Current |
| [13-habits-history-search-export.md](13-habits-history-search-export.md) | Study heatmap and streaks, History, global search in the palette, Markdown and Anki export | Current |
| [14-phone-and-lan.md](14-phone-and-lan.md)                               | Passcode gate, `pnpm start:lan`, Tailscale, phone and PWA polish                           | Current |
| [15-e2e-tests.md](15-e2e-tests.md)                                       | Playwright journeys, the scripted LLM, the CI e2e job                                      | Current |
| [16-embeddings-and-retrieval.md](16-embeddings-and-retrieval.md)         | Local embeddings, the background indexer, hybrid FTS + vector retrieval                    | Current |
| [17-study-planner.md](17-study-planner.md)                               | The deterministic study planner, /planner, the Today card                                  | Current |
| [18-whiteboard.md](18-whiteboard.md)                                     | The whiteboard canvas, Claude operations, tidy-tree mind maps, source links                | Current |
| [19-desktop-app.md](19-desktop-app.md)                                   | The Tauri desktop app and its Node sidecar                                                 | Current |
| [20-openai-compatible-providers.md](20-openai-compatible-providers.md)   | OpenAI-compatible providers, per-task routing, keychain                                    | Current |
| [21-annotations-and-links.md](21-annotations-and-links.md)               | PDF annotations, `thoth:` links, backlinks                                                 | Current |
| [22-spaces.md](22-spaces.md)                                             | Space chat, dashboard, notes, board, tags, bulk import                                     | Current |

Related: the reasons behind each choice are in [`../decision/`](../decision/README.md), and the phase plan is in [`../plan/roadmap.md`](../plan/roadmap.md).
