# 21. Annotations, links and backlinks

Status: Stub (Phase 10 Step 0). Lane 3 fills it in and updates docs 07 and 12. Decision: ADR-0038.

## Contracts already in place (Step 0)

| Piece                                                                                         | File                                                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `SourceAnchor`, `TextQuote`, `NormRect`, `formatLink`, `parseLink`, `parseLinks`, `findQuote` | `packages/core/src/domain/link.ts` (+ tests)                   |
| `Annotation` model (kinds, Hearth colour names, ink and shape payloads)                       | `packages/core/src/domain/annotation.ts`                       |
| `AnnotationRepository`, `LinkRepository`, `LinkRecord`                                        | `packages/core/src/ports/repositories.ts`                      |
| `annotations` and `links` tables, migration 0008                                              | `packages/db/src/schema/index.ts`                              |
| Adapters, tested                                                                              | `packages/db/src/repositories/{annotation,link}-repository.ts` |
| `saveNote` re-indexes the note's links on every save                                          | `packages/core/src/usecases/notes/notes.ts`                    |

## Link format

| URI                      | Target                                                |
| ------------------------ | ----------------------------------------------------- |
| `thoth:c/<id>`           | a content                                             |
| `thoth:c/<id>?at=p.3`    | a page; `t.201` a time (seconds); `par.4` a paragraph |
| `thoth:a/<id>`           | one annotation                                        |
| `thoth:s/<id>?q=<quote>` | a passage in a study set (a summary)                  |
| `thoth:space/<id>`       | a space                                               |
