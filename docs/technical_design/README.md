# Technical design

This folder describes **how Thoth works today**, plus clearly marked **planned** sections. Each doc starts with a status line. Update a doc in the same change as the code it describes.

| Doc                                                                  | Covers                                                                        | Status                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- |
| [01-architecture.md](01-architecture.md)                             | System context, packages, dependency rules, request flow, repo layout         | Current                            |
| [02-llm-providers.md](02-llm-providers.md)                           | The `LlmProvider` port, both adapters, structured output, troubleshooting     | Current                            |
| [03-ingestion.md](03-ingestion.md)                                   | Turning PDFs, YouTube and web pages into segments, chapters and search chunks | Planned (Phase 2)                  |
| [04-data-model.md](04-data-model.md)                                 | SQLite schema, migrations, IDs, timestamps                                    | Current (Phase 0 tables) + Planned |
| [05-frontend-and-design-system.md](05-frontend-and-design-system.md) | Next.js 16 patterns, Hearth tokens, components, the PWA                       | Current                            |
| [06-quality-and-workflow.md](06-quality-and-workflow.md)             | Tests, CI, the "add a feature" recipe, conventions for AI agents              | Current                            |

Related: the reasons behind each choice are in [`../decision/`](../decision/README.md), and the phase plan is in [`../plan/roadmap.md`](../plan/roadmap.md).
