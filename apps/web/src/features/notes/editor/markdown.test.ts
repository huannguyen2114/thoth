import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { notesExtensions } from "./extensions";
import { EMPTY_DOC, parseNote, serializeNote } from "./markdown";

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

/** A headless editor (no DOM in Node): the real schema, parser and serializer. */
function load(markdown: string): Editor {
  const editor = new Editor({ extensions: notesExtensions(), content: EMPTY_DOC });
  editor.commands.setContent(parseNote(editor, markdown), { emitUpdate: false });
  editors.push(editor);
  return editor;
}

const roundTrip = (markdown: string) => serializeNote(load(markdown));

/** Every block the editor offers (slash menu, shortcuts, toolbar), in its saved form. */
const BLOCKS: Record<string, string> = {
  paragraph: "Plain text with **bold**, *italic*, ~~strike~~ and `inline code`.",
  "heading 1": "# Cell biology",
  "heading 2": "## The mitochondrion",
  "heading 3": "### Inner membrane",
  "bulleted list": "- First point\n- Second point",
  "nested bulleted list": "- Organelles\n  - Nucleus\n  - Ribosome\n- Membranes",
  "numbered list": "1. Glycolysis\n2. Krebs cycle\n3. Electron transport",
  quote: "> Energy is neither created nor destroyed.",
  callout: "> **Note:** ATP is the energy currency of the cell [p.3].",
  "code block": "```\nconst atp = 30;\n```",
  "code block with language": "```ts\nconst atp: number = 30;\n```",
  divider: "Above\n\n---\n\nBelow",
  link: "See [the paper](https://example.com/paper).",
};

const CITATIONS: Record<string, string> = {
  page: "Mitochondria make ATP [p.3].",
  time: "The lecturer defines entropy at [03:21].",
  "long time": "Recap at [1:02:03].",
  paragraph: "The author disagrees in [§2].",
  "several in a row": "Compare [p.3] [p.12] and [§1].",
  "inside a list item": "- Key claim [p.4]\n- Counter claim [12:05]",
  "inside a heading": "## Results [p.7]",
};

describe("notes Markdown round-trip (Markdown in equals Markdown out)", () => {
  for (const [name, markdown] of Object.entries(BLOCKS)) {
    it(`keeps a ${name}`, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }

  it("keeps a whole note with every block together", () => {
    // Two lists in a row are one list in Markdown, so keep a paragraph between them.
    const { "bulleted list": list, ...rest } = BLOCKS;
    const note = [list, ...Object.values(rest)].join("\n\n");
    expect(roundTrip(note)).toBe(note);
  });

  it("is stable: saving what was loaded twice changes nothing", () => {
    const note = [...Object.values(BLOCKS), ...Object.values(CITATIONS)].join("\n\n");
    const once = roundTrip(note);
    expect(roundTrip(once)).toBe(once);
  });

  it("keeps an empty note empty", () => {
    expect(roundTrip("")).toBe("");
  });
});

describe("citation chips", () => {
  for (const [name, markdown] of Object.entries(CITATIONS)) {
    it(`round-trips a ${name} citation`, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }

  it("loads each token as a chip node, not as text", () => {
    const editor = load("See [p.3], [03:21] and [§2].");
    const chips: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "citation") chips.push(String(node.attrs.token));
    });
    expect(chips).toEqual(["[p.3]", "[03:21]", "[§2]"]);
    expect(editor.getText()).toContain("[p.3]");
  });

  it("leaves tokens inside code as text", () => {
    const markdown = "Write `[p.3]` to cite.\n\n```\n[p.3]\n```";
    const editor = load(markdown);
    let chips = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "citation") chips++;
    });
    expect(chips).toBe(0);
    expect(editor.getMarkdown()).toBe(markdown);
  });

  it("does not turn look-alikes into chips, and escapes them once", () => {
    const markdown = "Arrays use [0] and [p.x], links use [text](https://example.com).";
    const editor = load(markdown);
    let chips = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "citation") chips++;
    });
    expect(chips).toBe(0);
    const saved = editor.getMarkdown();
    expect(saved).toBe("Arrays use \\[0\\] and \\[p.x\\], links use [text](https://example.com).");
    expect(roundTrip(saved)).toBe(saved);
  });

  it("saves a citation written inside bold just after the bold, then stays stable", () => {
    const saved = roundTrip("**Main idea [p.2]**");
    expect(saved).toBe("**Main idea** [p.2]");
    expect(roundTrip(saved)).toBe(saved);
  });

  it("insertCitation adds a chip that saves as its token, and refuses junk", () => {
    const editor = load("Fact");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(editor.commands.insertCitation("[p.9]")).toBe(true);
    expect(editor.getMarkdown()).toBe("Fact[p.9]");
    expect(editor.commands.insertCitation("[nope]")).toBe(false);
  });
});

describe("drafts from Claude", () => {
  it("parses a typical Claude draft and keeps its citations as chips", () => {
    const draft = [
      "# Cellular respiration",
      "## Overview",
      "- **ATP** is made in the mitochondria [p.3]",
      "- Glycolysis happens in the cytoplasm [p.4]",
      "## Questions to think about",
      "1. Why is oxygen the final electron acceptor?",
      "2. What limits the rate of glycolysis?",
    ].join("\n\n");
    const editor = load(draft);
    expect(editor.getMarkdown()).toContain("[p.3]");
    let chips = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "citation") chips++;
    });
    expect(chips).toBe(2);
  });
});
