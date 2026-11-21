import { formatLink, isThothLink, parseLink } from "@thoth/core";
import { mergeAttributes, Node } from "@tiptap/react";

/**
 * A link chip to a place in Thoth (ADR-0038, doc 21): `[Lecture 2 · p.3](thoth:a/<id>)`.
 * Inline and atomic like a citation chip. Markdown in equals Markdown out; the round-trip tests
 * in `markdown.test.ts` prove it. Exported for space notes (Lane 4).
 */

/** `[label](thoth:...)` at the start of the text. The label has no brackets or newlines. */
const AT_START = /^\[([^[\]\n]*)\]\((thoth:[^)\s]+)\)/;

export const LINK_CHIP_CLASS =
  "badge badge--accent mx-0.5 inline-flex max-w-full cursor-pointer items-center gap-1 align-baseline select-none hover:underline";
export const BROKEN_CHIP_CLASS = "badge mx-0.5 cursor-pointer align-baseline select-none line-through";

export interface ThothLinkOptions {
  /**
   * Called when a chip is clicked. Resolve to an error message when the target is gone: the
   * chip then shows as broken (ADR-0038: a deleted target stays in the note as text).
   */
  onOpen: (href: string, label: string) => Promise<string | null> | undefined;
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    thothLink: {
      insertThothLink: (attrs: { href: string; label: string }) => ReturnType;
    };
  }
}

/** A label safe inside `[...]`: no brackets, no newlines, not empty. */
export function cleanLabel(label: string): string {
  const t = label.replace(/[[\]\n\r]+/g, " ").replace(/\s+/g, " ").trim();
  return t || "Link";
}

/** The same href in its one written form, so two spellings of a link compare equal. */
export function canonicalHref(href: string): string {
  const r = parseLink(href);
  return r.ok ? formatLink(r.value) : href;
}

export const ThothLink = Node.create<ThothLinkOptions>({
  name: "thothLink",
  group: "inline",
  inline: true,
  atom: true,
  // Like citation chips: @tiptap/markdown cannot put a mark on an inline atom (ADR-0025).
  marks: "",
  selectable: true,
  draggable: false,
  // Ahead of the Link mark, so `[x](thoth:...)` is a chip and never an ordinary link.
  priority: 1100,

  addOptions() {
    return { onOpen: () => undefined };
  },

  addAttributes() {
    return {
      href: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-href") ?? "",
        renderHTML: (attrs) => ({ "data-href": attrs.href }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      { tag: "span[data-thoth-link]" },
      // Pasted HTML from another Thoth tab or the app's own rendering.
      {
        tag: "a[href^='thoth:']",
        getAttrs: (el) => ({
          href: (el as HTMLElement).getAttribute("href") ?? "",
          label: (el as HTMLElement).textContent ?? "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-thoth-link": "", class: LINK_CHIP_CLASS }),
      String(node.attrs.label),
    ];
  },

  renderText({ node }) {
    return String(node.attrs.label);
  },

  addNodeView() {
    return ({ node }) => {
      const href = String(node.attrs.href);
      const label = String(node.attrs.label);
      const dom = document.createElement("button");
      dom.type = "button";
      dom.className = LINK_CHIP_CLASS;
      dom.contentEditable = "false";
      dom.dataset.thothLink = "";
      dom.dataset.href = canonicalHref(href);
      dom.textContent = label;
      dom.title = label;
      dom.setAttribute("aria-label", `Open ${label}`);
      dom.addEventListener("mousedown", (e) => e.preventDefault());
      dom.addEventListener("click", (e) => {
        e.preventDefault();
        const r = this.options.onOpen(href, label);
        void r?.then((error) => {
          if (!error) return;
          dom.className = BROKEN_CHIP_CLASS;
          dom.title = error;
          dom.setAttribute("aria-label", `${label}: ${error}`);
        });
      });
      return { dom, ignoreMutation: () => true };
    };
  },

  addCommands() {
    return {
      insertThothLink:
        ({ href, label }) =>
        ({ commands }) =>
          isThothLink(href) &&
          parseLink(href).ok &&
          commands.insertContent({ type: this.name, attrs: { href, label: cleanLabel(label) } }),
    };
  },

  // Markdown (@tiptap/markdown): an ordinary Markdown link whose href uses the thoth: scheme.
  markdownTokenName: "thothLink",
  markdownTokenizer: {
    name: "thothLink",
    level: "inline",
    start: (src: string) => {
      const i = src.indexOf("](thoth:");
      return i === -1 ? -1 : src.lastIndexOf("[", i);
    },
    tokenize: (src: string) => {
      const m = AT_START.exec(src);
      return m ? { type: "thothLink", raw: m[0], text: m[1] ?? "", href: m[2] ?? "" } : undefined;
    },
  },
  parseMarkdown: (token) => ({
    type: "thothLink",
    attrs: { href: String(token.href ?? ""), label: String(token.text ?? "") },
  }),
  renderMarkdown: (node) =>
    `[${cleanLabel(String(node.attrs?.label ?? ""))}](${String(node.attrs?.href ?? "")})`,
});
