# 01. Architecture

Status: Current (Phase 0)

## System context

Thoth is a single-user, local-first study app (ADR-0002). It runs on the owner's Mac. The owner reaches it from a desktop browser, or from a phone over LAN or Tailscale.

```mermaid
flowchart LR
  user([Owner]) -->|browser / installed PWA| web[Thoth web app<br/>Next.js on localhost]
  phone([Owner's phone]) -->|LAN / Tailscale, Phase 8| web
  web --> db[(SQLite<br/>data/thoth.db)]
  web --> files[(Uploads<br/>data/uploads)]
  web -->|API key| anthropic[Anthropic API]
  web -->|spawns| claude[claude CLI<br/>Claude subscription]
  web -->|transcripts, pages| internet[YouTube / websites]
```

## Packages and dependency rules

We use hexagonal architecture (ADR-0004) in a pnpm + Turborepo monorepo (ADR-0003). **Arrows are the only allowed imports.**

```mermaid
flowchart TD
  subgraph apps
    web["apps/web<br/>Next.js 16 · delivery adapter<br/>composition root: src/server/container.ts"]
  end
  subgraph packages
    core["@thoth/core<br/>domain · use cases · ports<br/>(depends on zod only)"]
    db["@thoth/db<br/>Drizzle + libSQL repositories"]
    llm["@thoth/llm<br/>LlmProvider adapters"]
    ui["@thoth/ui<br/>Hearth styles + React components"]
  end
  web --> core
  web --> db
  web --> llm
  web --> ui
  db --> core
  llm --> core
```

| Package                         | Owns                                                                                          | Must not                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `@thoth/core` (`packages/core`) | Entities (`domain/`), use cases (`usecases/`), ports (`ports/`), `Result` and IDs (`shared/`) | Import React, Next, Drizzle, SDKs, or `node:` modules         |
| `@thoth/db` (`packages/db`)     | Schema, migrations (`drizzle/`), repository adapters                                          | Contain business rules. It maps rows to domain types and back |
| `@thoth/llm` (`packages/llm`)   | Provider adapters, prompt plumbing, JSON repair and retry                                     | Know about UI or the DB                                       |
| `@thoth/ui` (`packages/ui`)     | Generated Hearth CSS, typed components such as `Button`                                       | Fetch data or call server code                                |
| `apps/web`                      | Routes, feature UIs, Server Actions, route handlers, wiring                                   | Put business rules in actions or components                   |

## Request flow (write path)

The "create space" flow is the reference for every feature:

```mermaid
sequenceDiagram
  actor U as Owner
  participant F as CreateSpaceForm<br/>(client component)
  participant A as createSpaceAction<br/>(Server Action)
  participant C as getContainer()<br/>(composition root)
  participant UC as createSpace<br/>(@thoth/core use case)
  participant R as DrizzleSpaceRepository<br/>(@thoth/db)
  participant DB as SQLite
  U->>F: submit name
  F->>A: FormData
  A->>C: get ports
  A->>UC: createSpace({spaces}, {name})
  UC->>UC: zod validate
  alt invalid
    UC-->>A: err(validation)
    A-->>F: { error: message }
  else valid
    UC->>R: create(newSpace)
    R->>DB: INSERT ... RETURNING
    R-->>UC: Space
    UC-->>A: ok(Space)
    A->>A: refresh()
    A-->>F: { error: null }
  end
```

**Read path.** `SpacesList` is an async Server Component inside `<Suspense>`. It calls `await connection()`, then `listSpaces(await getContainer())` (ADR-0011).

## Composition root

`apps/web/src/server/container.ts` is the **only** place that constructs adapters:

- It builds the libSQL client from `THOTH_DATA_DIR`.
- It runs migrations once per process.
- It returns ports.

Tests build their own containers with fakes or `:memory:` databases.

## Repository layout

```text
thoth/
├─ apps/web/                 Next.js app (routing in src/app, features in src/features, wiring in src/server)
├─ packages/
│  ├─ core/                  Domain, use cases, ports. Pure TypeScript.
│  ├─ db/                    Drizzle schema, migrations, repositories
│  ├─ llm/                   LLM provider adapters
│  ├─ ui/                    Hearth CSS (generated) and React components
│  └─ tsconfig/              Shared tsconfig presets
├─ design/hearth/            Vendored Hearth design system (read-only)
├─ docs/                     decision/ (ADRs), technical_design/, plan/, research/
├─ tools/                    Repo scripts (ADR append-only check)
├─ data/                     Runtime data, git-ignored (SQLite, uploads)
└─ CLAUDE.md                 Entry point for AI agents
```

## Planned growth (no restructuring needed)

| Phase               | Where it lands                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1 LLM providers     | `packages/llm/src/{anthropic-api,claude-subscription}.ts`; a settings use case in core; `features/settings`   |
| 2 Ingestion         | A new `packages/ingest` (parsers, which depend on core); a jobs table and runner in `db`                      |
| 3–7 Learning tools  | Use cases in `core/usecases/*`; tables in `db/schema`; UIs in `features/{chat,summary,quiz,flashcards,exams}` |
| 12 Chrome extension | A new `apps/extension` that reuses `core` and `ui`                                                            |
