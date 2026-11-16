import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { notesExtensions } from "./extensions";
import { EMPTY_DOC, parseNote, serializeNote } from "./markdown";
import { filterSlashItems, findSlash, SLASH_ITEMS } from "./slash";

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

/** A headless editor holding `markdown`, with the caret at the end of the last block. */
function at(markdown: string): Editor {
  const editor = new Editor({ extensions: notesExtensions(), content: EMPTY_DOC });
  editor.commands.setContent(parseNote(editor, markdown), { emitUpdate: false });
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  editors.push(editor);
  return editor;
}

describe("findSlash", () => {
  it("opens on a slash at the start of a block or after a space", () => {
    expect(findSlash(at("/").state)).toMatchObject({ query: "" });
    expect(findSlash(at("/head").state)).toMatchObject({ query: "head" });
    expect(findSlash(at("Some text /quo").state)).toMatchObject({ query: "quo" });
  });

  it("gives the range of the slash and the query, so a command can delete it", () => {
    const editor = at("Hi /h2");
    const match = findSlash(editor.state);
    expect(match && editor.state.doc.textBetween(match.from, match.to)).toBe("/h2");
  });

  it("stays closed inside words, paths and code blocks", () => {
    expect(findSlash(at("and/or").state)).toBeNull();
    expect(findSlash(at("/ starts with a space").state)).toBeNull();
    expect(findSlash(at("```\n/usr\n```").state)).toBeNull();
  });
});

describe("slash menu items", () => {
  it("filters by label and keywords", () => {
    expect(filterSlashItems("").length).toBe(SLASH_ITEMS.length);
    expect(filterSlashItems("head").map((i) => i.id)).toEqual(["h1", "h2", "h3"]);
    expect(filterSlashItems("callout").map((i) => i.id)).toEqual(["callout"]);
    expect(filterSlashItems("hr").map((i) => i.id)).toEqual(["divider"]);
    expect(filterSlashItems("zzz")).toEqual([]);
  });

  // What the note saves after choosing the item and typing "x".
  const cases: Record<string, string> = {
    text: "x",
    h1: "# x",
    h2: "## x",
    h3: "### x",
    bullets: "- x",
    numbers: "1. x",
    quote: "> x",
    callout: "> **Note:** x",
    code: "```\nx\n```",
    divider: "---\n\nx",
  };
  for (const item of SLASH_ITEMS) {
    it(`"${item.label}" turns "/" into its block and saves as Markdown`, () => {
      const editor = at("/");
      const match = findSlash(editor.state);
      if (!match) throw new Error("no slash match");
      item.run(editor, match);
      editor.commands.insertContent({ type: "text", text: "x" });
      expect(serializeNote(editor)).toBe(cases[item.id]);
    });
  }
});

describe("serializeNote", () => {
  it("drops the blank lines of the trailing empty paragraph", () => {
    const editor = at("- a list");
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    expect(editor.getMarkdown()).not.toBe("- a list");
    expect(serializeNote(editor)).toBe("- a list");
  });
});
