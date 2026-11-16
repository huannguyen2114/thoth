import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/react";

/**
 * A callout is a plain Markdown quote that starts with a bold label:
 * `> **Note:** Mitochondria make ATP [p.3]`. Markdown has no callout block, so we keep the
 * quote (portable, round-trips) and only *decorate* it as a Hearth callout while editing.
 */
export const CALLOUT_LABEL = /^(Note|Tip|Important|Warning):/;
export const CALLOUT_CLASS = "notes-callout";

const key = new PluginKey("notesCallout");

function decorate(doc: import("@tiptap/pm/model").Node): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "blockquote") {
      const first = node.firstChild?.firstChild;
      const bold = first?.marks.some((m) => m.type.name === "bold");
      if (first?.isText && bold && CALLOUT_LABEL.test(first.text ?? "")) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: CALLOUT_CLASS }));
      }
      return false;
    }
    // Only containers can hold a quote; skip the inline content of paragraphs.
    return node.isBlock && !node.isTextblock;
  });
  return DecorationSet.create(doc, decorations);
}

export const Callout = Extension.create({
  name: "notesCallout",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => decorate(state.doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});
