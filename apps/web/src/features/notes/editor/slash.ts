import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { type Editor, Extension, type Range } from "@tiptap/react";

/** The "/query" being typed: `from` is the slash, `to` the caret. */
export interface SlashMatch extends Range {
  query: string;
}

export interface SlashOptions {
  /** Called after every editor update with the open match, or null when the menu should close. */
  onChange: (match: SlashMatch | null, view: EditorView | null) => void;
  /** Arrow keys, Enter and Tab while the menu is open. Return true when handled. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashState {
  /** The slash position the owner closed with Escape; the menu stays closed for it. */
  dismissedAt: number | null;
}

const key = new PluginKey<SlashState>("notesSlash");

/** A "/" at the start of a block or after a space, followed by up to 24 letters, digits or spaces. */
const SLASH = /(?:^|\s)\/([\p{L}\p{N}][\p{L}\p{N} ]{0,23}|)$/u;

export function findSlash(state: EditorState): SlashMatch | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parent.type.spec.code || !$from.parent.isTextblock) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const m = SLASH.exec(before);
  if (!m) return null;
  const query = m[1] ?? "";
  return { from: $from.pos - query.length - 1, to: $from.pos, query };
}

function activeMatch(state: EditorState): SlashMatch | null {
  const match = findSlash(state);
  if (!match) return null;
  return key.getState(state)?.dismissedAt === match.from ? null : match;
}

/** Tracks "/query" for the slash menu (doc 12). The menu itself is React: `slash-menu.tsx`. */
export const SlashCommand = Extension.create<SlashOptions>({
  name: "notesSlash",

  addOptions() {
    return { onChange: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const editor = this.editor;
    return [
      new Plugin<SlashState>({
        key,
        state: {
          init: () => ({ dismissedAt: null }),
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(key) as SlashState | undefined;
            if (meta) return meta;
            if (prev.dismissedAt === null) return prev;
            const at = tr.mapping.map(prev.dismissedAt);
            return findSlash(next)?.from === at ? { dismissedAt: at } : { dismissedAt: null };
          },
        },
        view: () => ({
          update: (view) =>
            options.onChange(editor.isEditable ? activeMatch(view.state) : null, view),
          destroy: () => options.onChange(null, null),
        }),
        props: {
          handleKeyDown(view, event) {
            const match = editor.isEditable ? activeMatch(view.state) : null;
            if (!match) return false;
            if (event.key === "Escape") {
              view.dispatch(view.state.tr.setMeta(key, { dismissedAt: match.from }));
              return true;
            }
            return options.onKeyDown(event);
          },
        },
      }),
    ];
  },
});

export interface SlashItem {
  id: string;
  label: string;
  /** The Markdown shortcut that makes the same block, shown on the right. */
  hint: string;
  /** Short glyph in the item's icon box. */
  glyph: string;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
}

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "text",
    label: "Text",
    hint: "",
    glyph: "T",
    keywords: ["paragraph", "plain"],
    run: (e, r) => chain(e, r).setParagraph().run(),
  },
  {
    id: "h1",
    label: "Heading 1",
    hint: "#",
    glyph: "H1",
    keywords: ["title", "big"],
    run: (e, r) => chain(e, r).setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "##",
    glyph: "H2",
    keywords: ["section", "subtitle"],
    run: (e, r) => chain(e, r).setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "###",
    glyph: "H3",
    keywords: ["subsection", "small"],
    run: (e, r) => chain(e, r).setHeading({ level: 3 }).run(),
  },
  {
    id: "bullets",
    label: "Bulleted list",
    hint: "-",
    glyph: "•",
    keywords: ["unordered", "ul", "points"],
    run: (e, r) => chain(e, r).toggleBulletList().run(),
  },
  {
    id: "numbers",
    label: "Numbered list",
    hint: "1.",
    glyph: "1.",
    keywords: ["ordered", "ol", "steps"],
    run: (e, r) => chain(e, r).toggleOrderedList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: ">",
    glyph: "“",
    keywords: ["blockquote", "cite"],
    run: (e, r) => chain(e, r).toggleBlockquote().run(),
  },
  {
    id: "callout",
    label: "Callout",
    hint: "> **Note:**",
    glyph: "i",
    keywords: ["note", "tip", "info", "important", "warning"],
    run: (e, r) =>
      chain(e, r)
        .toggleBlockquote()
        .insertContent([
          { type: "text", text: "Note:", marks: [{ type: "bold" }] },
          { type: "text", text: " " },
        ])
        .unsetBold()
        .run(),
  },
  {
    id: "code",
    label: "Code block",
    hint: "```",
    glyph: "{}",
    keywords: ["snippet", "pre", "fence"],
    run: (e, r) => chain(e, r).setCodeBlock().run(),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "---",
    glyph: "—",
    keywords: ["rule", "line", "separator", "hr"],
    run: (e, r) => chain(e, r).setHorizontalRule().run(),
  },
];

/** Items whose label or keywords start with a word of the query, in menu order. */
export function filterSlashItems(query: string, items: SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    [item.label, ...item.keywords].some((word) =>
      word
        .toLowerCase()
        .split(/\s+/)
        .some((w) => w.startsWith(q) || word.toLowerCase().startsWith(q)),
    ),
  );
}
