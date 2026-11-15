# 04. Data model

Status: Current for Phase 0 tables. Planned tables are marked. Decision: ADR-0006.

## Current (Phase 0)

Schema: `packages/db/src/schema/index.ts`. Migrations: `packages/db/drizzle/`.

```mermaid
erDiagram
  spaces ||--o{ contents : "groups"
  spaces {
    text id PK "uuid"
    text name
    text description "nullable"
    int created_at "epoch ms"
    int updated_at "epoch ms"
  }
  contents {
    text id PK
    text space_id FK "nullable, set null on delete"
    text kind "pdf|youtube|webpage|text"
    text title
    text source_url "nullable"
    text file_path "nullable"
    text status "pending|processing|ready|failed"
    text error "nullable"
    int created_at
    int updated_at
  }
  settings {
    text key PK
    text value "JSON"
    int updated_at
  }
```

## Planned

```mermaid
erDiagram
  contents ||--o{ segments : "has (Phase 2)"
  contents ||--o{ chapters : "has (Phase 2)"
  contents ||--o{ chats : "has (Phase 3)"
  chats ||--o{ messages : ""
  contents ||--o{ sets : "generated (Phase 4+)"
  spaces ||--o{ sets : "exams (Phase 7)"
  sets ||--o{ quiz_questions : "Phase 5"
  quiz_questions ||--o{ quiz_attempts : ""
  sets ||--o{ flashcards : "Phase 6"
  flashcards ||--o{ reviews : "FSRS log"
  contents ||--o| notes : "Phase 4"
```

## Conventions

- **IDs** are random UUID text, typed as branded IDs in core (`SpaceId`, `ContentId`). Never mix them.
- **Time** is stored as integer epoch milliseconds (`timestamp_ms`) and is a `Date` in the domain.
- **JSON columns** are used only for opaque option bags and citations. Anything we query lives in real columns.
- **Schema changes:** edit `schema/`, run `pnpm --filter @thoth/db db:generate`, and commit the SQL. Never edit an applied migration.
- **Secrets never go in the database** (ADR-0008).
