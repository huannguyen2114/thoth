import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Extension, type Range } from "@tiptap/react";

/** The `[[query` or `@query` being typed: `from` is the trigger, `to` the caret. */
export interface LinkMatch extends Range {
  trigger: "[[" | "@";
  query: string;
}

export interface LinkTriggerOptions {
  /** Called after every editor update with the open match, or null when the picker should close. */
  onChange: (match: LinkMatch | null, view: EditorView | null) => void;
  /** Arrow keys, Enter and Tab while the picker is open. Return true when handled. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface TriggerState {
  dismissedAt: number | null;
}

const key = new PluginKey<TriggerState>("notesLinkTrigger");

/**
 * `[[` anywhere, or `@` at the start of a block or after a space (so emails do not trigger),
 * then up to 40 characters of query without brackets or a new line.
 */
const TRIGGER = /(\[\[|(?:^|(?<=\s))@)([^[\]\n@]{0,40})$/u;

export function findLinkTrigger(state: EditorState): LinkMatch | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parent.type.spec.code || !$from.parent.isTextblock) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const m = TRIGGER.exec(before);
  if (!m) return null;
  const trigger = m[1] === "[[" ? "[[" : "@";
  const query = m[2] ?? "";
  // "@ " followed by a space at once is just an at sign.
  if (trigger === "@" && query.startsWith(" ")) return null;
  return { from: $from.pos - query.length - trigger.length, to: $from.pos, trigger, query };
}

function activeMatch(state: EditorState): LinkMatch | null {
  const match = findLinkTrigger(state);
  if (!match) return null;
  return key.getState(state)?.dismissedAt === match.from ? null : match;
}

/** Tracks `[[` / `@` for the link picker (doc 21). The picker itself is `link-picker.tsx`. */
export const LinkTrigger = Extension.create<LinkTriggerOptions>({
  name: "notesLinkTrigger",

  addOptions() {
    return { onChange: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const editor = this.editor;
    return [
      new Plugin<TriggerState>({
        key,
        state: {
          init: () => ({ dismissedAt: null }),
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(key) as TriggerState | undefined;
            if (meta) return meta;
            if (prev.dismissedAt === null) return prev;
            const at = tr.mapping.map(prev.dismissedAt);
            return findLinkTrigger(next)?.from === at ? { dismissedAt: at } : { dismissedAt: null };
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
