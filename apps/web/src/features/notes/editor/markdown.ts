import type { Editor, JSONContent } from "@tiptap/react";

/** A document must hold at least one block. */
export const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Markdown to editor JSON with the editor's own parser (`@tiptap/markdown`). An empty note is
 * one empty paragraph: a document must hold at least one block.
 */
export function parseNote(editor: Editor, markdown: string): JSONContent {
  const content = markdown.trim() && editor.markdown ? editor.markdown.parse(markdown).content : [];
  return content?.length ? { type: "doc", content } : EMPTY_DOC;
}

/**
 * The note as Markdown, the storage format (ADR-0022). An empty editor is "". The blank lines
 * of a trailing empty paragraph (where the caret lands after a list or a code block) are dropped.
 */
export function serializeNote(editor: Editor): string {
  return editor.isEmpty ? "" : editor.getMarkdown().trimEnd();
}
