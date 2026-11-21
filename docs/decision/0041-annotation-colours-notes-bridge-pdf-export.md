# ADR-0041: Annotation colours, the notes bridge and PDF export

- Status: Accepted
- Date: 2026-11-21
- Builds on: ADR-0009, ADR-0022, ADR-0038

## Context

ADR-0038 fixed the link format, the annotation model and the backlink index. Building on it, Lane 3 had to choose how colours are drawn, how a passage reaches a notes editor that may be closed, how the PDF is drawn on and exported, and what a summary passage can do.

## Decision

1. **Colour names map to Hearth status hues.** Hearth has one brand hue and four status hues, so `yellow → warning`, `green → success`, `blue → info`, `pink → danger`, `purple → accent`. Text highlights use the `-tint` ground; PDF marks use the solid token at 35% with `multiply`. The PDF export reads the same tokens from `design/hearth/tokens.json` (highlights: dark-theme value, strokes: light-theme value), so no hex lives in code.
2. **Two new dependencies in `apps/web`:** `pdf-lib` 1.17.1 (MIT) writes standard PDF annotations into a copy of the file; `perfect-freehand` 1.2.3 (MIT) turns pointer samples with pressure into ink outlines. Neither enters `@thoth/core`.
3. **Text highlights store only a locator and a quote** and are found again with `findQuote` on every render. PDF highlights also store page rects. A highlight whose passage is gone is not drawn and stays in the Annotations list.
4. **Add to notes goes through the editor.** A small client bridge (`features/notes/editor/bridge.ts`) queues requests per notes owner until that editor has loaded. The editor appends `> passage [label](href)` and autosaves, so `saveNote` writes the backlink row as for any edit. There is no server-side append.
5. **From a PDF, Add to notes and Make flashcard first save a highlight,** and the chip links to it (`thoth:a/`). From text, the chip links to the place and quote (`thoth:c/…?at=&q=`) and nothing is highlighted unless the owner picks a colour.
6. **Panels open through the palette.** `ViewerProvider.showPanel(id)` runs the workspace command `workspace.show.<id>`, so jumps to Notes or Summary need no change to the workspace.
7. **Summary passages are not stored as annotations.** `Annotation.anchor` is a `content` anchor, so the Summary toolbar offers Add to notes (`thoth:s/<id>?q=`) and Make flashcard only.

## Alternatives considered

- **Hand-written PDF objects** instead of `pdf-lib`: smaller, but incremental updates, cross-reference streams and object streams are easy to get wrong.
- **Appending to the note on the server** for Add to notes: works with the panel closed, but an open editor would overwrite it on its next autosave.
- **A dock panel for Annotations:** needs the workspace's panel registry, which is not this lane's file. The list is a drawer in the PDF toolbar and takes only `contentId`, so it can become a panel in one line.

## Consequences

- Annotation colours change with the Hearth tokens.
- Rotated PDF pages are drawn and exported as if unrotated; scanned PDFs get pen, shapes and pins only.
- Storing summary highlights later needs a `set` anchor on annotations (a new ADR).
