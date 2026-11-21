import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { notesExtensions } from "./extensions";
import { findLinkTrigger } from "./link-trigger";
import { EMPTY_DOC, parseNote, serializeNote } from "./markdown";
import { quoteBlocks } from "./quote";
import { canonicalHref, cleanLabel } from "./thoth-link";

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

function load(markdown: string): Editor {
  const editor = new Editor({ extensions: notesExtensions(), content: EMPTY_DOC });
  editor.commands.setContent(parseNote(editor, markdown), { emitUpdate: false });
  editors.push(editor);
  return editor;
}
const roundTrip = (markdown: string) => serializeNote(load(markdown));

const chipsOf = (editor: Editor) => {
  const out: { href: string; label: string }[] = [];
  editor.state.doc.descendants((n) => {
    if (n.type.name === "thothLink") out.push({ href: n.attrs.href, label: n.attrs.label });
  });
  return out;
};

const LINKS: Record<string, string> = {
  annotation: "See [Lecture 2 · p.3](thoth:a/0b6f7c1e-1d2a-4b8e-9c3d-5e6f7a8b9c0d).",
  "content page": "Back to [Thermo · p.12](thoth:c/abc123?at=p.12) later.",
  "content time with quote": "Said at [Talk · 03:21](thoth:c/abc?at=t.201&q=the+second+law).",
  "summary passage": "From [Lecture · Summary](thoth:s/set_1?q=Entropy+rises).",
  space: "Part of [Physics 101](thoth:space/sp-1).",
  "label like a citation": "Quote [p.3](thoth:a/ann1) here.",
  "next to a citation": "Compare [p.3] with [Other · p.4](thoth:c/other?at=p.4).",
  "inside a quote": "> Mitochondria make ATP [Bio · p.3](thoth:a/ann1)",
  "inside a list": "- First [A](thoth:c/a)\n- Second [B · p.2](thoth:c/b?at=p.2)",
  "inside a heading": "## Results [Paper · p.7](thoth:c/paper?at=p.7)",
};

describe("thoth link chips (doc 21)", () => {
  for (const [name, markdown] of Object.entries(LINKS)) {
    it(`round-trips a ${name} link`, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }

  it("loads a link as a chip node with its href and label, not as a Link mark", () => {
    const editor = load("See [Lecture 2 · p.3](thoth:a/ann1) and [p.3].");
    expect(chipsOf(editor)).toEqual([{ href: "thoth:a/ann1", label: "Lecture 2 · p.3" }]);
    let marks = 0;
    editor.state.doc.descendants((n) => {
      if (n.marks.some((m) => m.type.name === "link")) marks++;
    });
    expect(marks).toBe(0);
    let citations = 0;
    editor.state.doc.descendants((n) => {
      if (n.type.name === "citation") citations++;
    });
    expect(citations).toBe(1);
  });

  it("keeps ordinary web links as links", () => {
    const md = "Read [the paper](https://example.com) and [mine](thoth:c/x).";
    expect(roundTrip(md)).toBe(md);
    expect(chipsOf(load(md))).toHaveLength(1);
  });

  it("is stable when saved twice", () => {
    const note = Object.values(LINKS).join("\n\n");
    const once = roundTrip(note);
    expect(once).toBe(note);
    expect(roundTrip(once)).toBe(once);
  });

  it("insertThothLink adds a chip with a clean label and refuses non-thoth links", () => {
    const editor = load("Fact");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(editor.commands.insertThothLink({ href: "thoth:c/x?at=p.2", label: "A [b]\nc" })).toBe(
      true,
    );
    expect(serializeNote(editor)).toBe("Fact[A b c](thoth:c/x?at=p.2)");
    expect(editor.commands.insertThothLink({ href: "https://x.y", label: "no" })).toBe(false);
    expect(editor.commands.insertThothLink({ href: "thoth:zz/1", label: "no" })).toBe(false);
  });

  it("a quote sent to notes is a blockquote ending in its chip", () => {
    const editor = load("# Notes");
    editor.commands.insertContentAt(
      editor.state.doc.content.size,
      quoteBlocks("Entropy never\n decreases.", "thoth:a/ann9", "Thermo · p.2"),
    );
    expect(serializeNote(editor)).toBe(
      "# Notes\n\n> Entropy never decreases. [Thermo · p.2](thoth:a/ann9)",
    );
  });

  it("canonicalises hrefs and labels", () => {
    expect(canonicalHref("thoth:c/x?at=03:21")).toBe("thoth:c/x?at=t.201");
    expect(canonicalHref("not a link")).toBe("not a link");
    expect(cleanLabel("  ")).toBe("Link");
  });
});

describe("[[ and @ trigger", () => {
  const at = (text: string) => {
    const editor = load(text);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    return findLinkTrigger(editor.state);
  };
  it("opens on [[ and on @ after a space, with the query", () => {
    expect(at("See [[therm")).toMatchObject({ trigger: "[[", query: "therm" });
    expect(at("See @lect 2")).toMatchObject({ trigger: "@", query: "lect 2" });
    expect(at("@")).toMatchObject({ trigger: "@", query: "" });
  });
  it("does not open inside an email or after a closed link", () => {
    expect(at("mail me@example")).toBeNull();
    expect(at("done [[x]] ok")).toBeNull();
  });
});
