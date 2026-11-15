# ADR-0022: Notes use a live-preview Tiptap editor, stored as Markdown

- Status: Accepted
- Date: 2026-11-15

## Context

The Phase 4 notes editor had separate Write and Preview panes. The owner wants to see the result as they type, in one pane, like Notion.

## Decision

1. **Tiptap** 3.32.2 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`) with the official `@tiptap/markdown` extension:
   - one editable, formatted surface;
   - Markdown shortcuts (`#`, `-`, `>`, `**`, a fenced code block);
   - a slash menu for blocks.
2. **Storage stays Markdown** in `notes.markdown`. There is no schema change. The editor loads and saves Markdown, so notes stay portable and exportable.
3. **Citations are an inline node.** Typing or pasting `[p.3]`, `[03:21]` or `[§2]` becomes a chip that calls `onCite`. In Markdown it is written back as the same token.
4. **"Draft notes with Claude"** streams into the editor at the cursor, or replaces the notes after a confirmation.

## Consequences

- Some rich formatting that Markdown cannot express (for example colours) is not offered.
- Round-trip tests must prove that Markdown in equals Markdown out for every block we offer.
