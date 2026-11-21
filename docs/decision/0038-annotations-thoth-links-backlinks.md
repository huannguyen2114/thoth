# ADR-0038: Annotations, `thoth:` links and a backlink index

- Status: Accepted
- Date: 2026-11-21
- Builds on: ADR-0019, ADR-0022, ADR-0031

## Context

The owner wants to:

- annotate PDFs (highlight, comment, freehand pen, shapes) and export the annotated file;
- send a passage from a PDF, transcript or summary to notes as a quote that jumps back to that spot;
- link notes to other contents;
- see on the source which notes quote it;
- turn a highlight into a flashcard.

Citation tokens (`[p.3]`, `[03:21]`, `[§2]`) mean "in this content" and cannot name another content, a highlight or a summary passage.

## Decision

1. **One anchor type.** `SourceAnchor` (`packages/core/src/domain/link.ts`) points at one of four things:
   - a content, optionally with a locator, a text quote and PDF page rects in 0..1 page space;
   - an annotation;
   - a study set, such as a summary, with a quote;
   - a space.

   Quotes use the W3C text-quote shape (`exact`, `prefix`, `suffix`). `findQuote` finds the passage again after the text around it changes, such as a regenerated summary.
2. **Links are Markdown links with a `thoth:` URI:**

   | URI                   | Points to                                                         |
   | --------------------- | ----------------------------------------------------------------- |
   | `thoth:c/<id>?at=p.3` | a page in a content (`t.SEC` for a time, `par.N` for a paragraph) |
   | `thoth:a/<id>`        | an annotation                                                     |
   | `thoth:s/<id>?q=…`    | a passage in a study set                                          |
   | `thoth:space/<id>`    | a space                                                           |

   The notes Markdown stays readable and exportable. `formatLink`, `parseLink` and `parseLinks` are the only code that reads or writes the format. Bare citation tokens keep working as before.
3. **Annotations are stored apart from the file** (`annotations` table): kind, anchor, colour (a Hearth accent name), comment, and an ink or shape payload in page space. The original PDF is never changed. Export writes a copy with standard PDF annotations.
4. **The backlink index is derived data.** `saveNote` re-parses the note's links and replaces its rows in `links` (`LinkRepository.replaceFrom`); chat messages and boards do the same. Each row is resolved to the content it lands in when it is written, so "referenced in N notes" is one indexed query. The text stays the source of truth: rebuilding the index from the notes gives the same rows.
5. **The PDF viewer gains a text layer** (pdf.js `TextLayer`) for selection, and an SVG overlay for annotations. Scanned PDFs without text support pen and shapes only.

## Consequences

- A link to a deleted target stays in the note as text and is shown as a broken chip. The index drops it on the next save.
- Annotation geometry is resolution-independent, so zoom and export need no conversion beyond page size.
- A future web clipper or a second device can produce the same link format.
