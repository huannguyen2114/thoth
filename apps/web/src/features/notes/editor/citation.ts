import { mergeAttributes, Node, nodeInputRule, nodePasteRule } from "@tiptap/react";

/**
 * The citation tokens of `@thoth/core` `parseCitations`: [p.3] pages, [03:21] or [1:02:03]
 * times, [§2] paragraphs (1-based, ADR-0019). Kept in step with core by the round-trip tests.
 */
const TOKEN = String.raw`\[(?:p\.\d+|\d{1,2}(?::\d{2}){1,2}|§\d+)\]`;
// Not when a link target follows: `[p.3](thoth:...)` is a link chip (thoth-link.ts).
const AT_START = new RegExp(`^${TOKEN}(?!\\()`);
const TYPED = new RegExp(`${TOKEN}$`);
const PASTED = new RegExp(TOKEN, "g");
/** Where a token might begin, so the Markdown lexer only tries us at a "[". */
const MAYBE_START = /\[(?:p\.|\d|§)/;

export const CHIP_CLASS =
  "badge badge--accent mx-0.5 cursor-pointer align-baseline select-none hover:underline";

export interface CitationOptions {
  /** Called with the full token, e.g. "[p.3]", when a chip is clicked. */
  onCite: (token: string) => void;
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    citation: {
      insertCitation: (token: string) => ReturnType;
    };
  }
}

export function isCitationToken(token: string): boolean {
  return new RegExp(`^${TOKEN}$`).test(token);
}

/**
 * An inline, atomic chip for a source citation (ADR-0022). Typing or pasting a token makes a
 * chip; Markdown `[p.3]` loads as a chip and saves back as the same `[p.3]`.
 */
export const Citation = Node.create<CitationOptions>({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  // A chip carries no bold or italic: @tiptap/markdown cannot mark an inline atom, so a chip
  // inside **bold** saves just after it. Keeping it mark-free makes the editor show that too.
  marks: "",
  selectable: true,
  draggable: false,

  addOptions() {
    return { onCite: () => {} };
  },

  addAttributes() {
    return {
      token: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-token") ?? "",
        renderHTML: (attrs) => ({ "data-token": attrs.token }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-citation]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-citation": "", class: CHIP_CLASS }),
      String(node.attrs.token).slice(1, -1),
    ];
  },

  renderText({ node }) {
    return String(node.attrs.token);
  },

  addNodeView() {
    return ({ node }) => {
      const token = String(node.attrs.token);
      const dom = document.createElement("button");
      dom.type = "button";
      dom.className = CHIP_CLASS;
      dom.contentEditable = "false";
      dom.dataset.citation = "";
      dom.dataset.token = token;
      dom.textContent = token.slice(1, -1);
      dom.setAttribute("aria-label", `Go to ${token.slice(1, -1)} in the source`);
      // Keep the caret where it is; the chip is a link, not text to select.
      dom.addEventListener("mousedown", (e) => e.preventDefault());
      dom.addEventListener("click", (e) => {
        e.preventDefault();
        this.options.onCite(token);
      });
      return { dom, ignoreMutation: () => true };
    };
  },

  addCommands() {
    return {
      insertCitation:
        (token) =>
        ({ commands }) =>
          isCitationToken(token) && commands.insertContent({ type: this.name, attrs: { token } }),
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: TYPED,
        type: this.type,
        getAttributes: (match) => ({ token: match[0] }),
      }),
    ];
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: PASTED,
        type: this.type,
        getAttributes: (match) => ({ token: match[0] }),
      }),
    ];
  },

  // Markdown (@tiptap/markdown): the token is its own Markdown, both ways.
  markdownTokenName: "citation",
  markdownTokenizer: {
    name: "citation",
    level: "inline",
    start: (src: string) => src.search(MAYBE_START),
    tokenize: (src: string) => {
      const m = AT_START.exec(src);
      return m ? { type: "citation", raw: m[0], text: m[0] } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: "citation", attrs: { token: token.raw } }),
  renderMarkdown: (node) => String(node.attrs?.token ?? ""),
});
