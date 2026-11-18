# ADR-0031: One whiteboard canvas for visual explanations and mind maps, linked to the source

- Status: Accepted
- Date: 2026-11-18

## Context

The owner wants a whiteboard like Claude's: Claude lays out an explanation visually (blocks, sections, arrows, tables, simple drawings), the owner edits it, and asks Claude to extend or change it. Mind maps are one kind of drawing on the same canvas. Every element must be able to link to the exact place in the source.

## Decision

1. **A board** (`whiteboards`) belongs to one content or one space. It holds an elements document (JSON) and a version number for optimistic concurrency.
2. **Element model**, zod-validated in core (`packages/core/src/domain/whiteboard.ts`):
   - `shape` (rect, rounded, ellipse, diamond, pill), `text`, `arrow` (from and to element ids, with a label), `section`, `table`, `image` (an inline SVG drawing) and `sticky`;
   - every element has an optional **`source`** (`{ contentId, token }`, for example `[p.3]`) that opens the content at that place;
   - layout follows the rules in ADR-0031's design doc (`docs/technical_design/18-whiteboard.md`): one idea per element, left to right, no overlaps.
3. **Claude writes boards through structured output:**
   - a use case asks for a list of operations (`add`, `update`, `remove`, `connect`) against the current board, validates them, applies them and bumps the version;
   - **"Mind map"** is a generation mode: Claude returns a concept tree from the chapters, and core lays it out with a tidy-tree algorithm, so layout quality does not depend on the model;
   - people's own edits are never overwritten, because operations target ids and a stale version is refused and retried.
4. **Canvas UI:** a custom React canvas (SVG for drawing, DOM for text) in `features/whiteboard`, with pan, zoom, select, move, resize, connect, inline text editing, undo and redo, and Hearth tokens for both themes. No third-party whiteboard SDK is used: tldraw's licence needs a key for production, and Excalidraw's hand-drawn style clashes with Hearth.
5. **The board is a Learn tool**, so it is a dock panel (ADR-0021) beside the source, and its source links jump the Source panel.

## Consequences

- More UI code to own, but full control of look, behaviour and the source links.
- The operations format is the contract between Claude and the canvas. Change it only through an ADR.
