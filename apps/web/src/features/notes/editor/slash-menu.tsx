"use client";

import { cx } from "@thoth/ui";
import type { Editor } from "@tiptap/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filterSlashItems, type SlashItem, type SlashMatch, type SlashOptions } from "./slash";

interface Open {
  match: SlashMatch;
  left: number;
  top: number;
  bottom: number;
}

const MENU_MAX_HEIGHT = 320; // max-h-80
const MENU_WIDTH = 240;
const GAP = 4;

/**
 * State and keyboard handling for the slash menu. Pass `options` to the `SlashCommand`
 * extension once (they are stable), and render `<SlashMenu {...menu} />`.
 */
export function useSlashMenu() {
  const [open, setOpen] = useState<Open | null>(null);
  const [index, setIndex] = useState(0);
  const items = useMemo(() => (open ? filterSlashItems(open.match.query) : []), [open]);
  const live = useRef({ items, index, open, editor: null as Editor | null });
  live.current = { ...live.current, items, index, open };

  // A new query starts at the top of the list.
  const query = open?.match.query;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the query changes
  useEffect(() => setIndex(0), [query]);

  const options = useMemo<SlashOptions>(
    () => ({
      onChange(match, view) {
        if (!match || !view) return setOpen(null);
        const at = view.coordsAtPos(match.from);
        setOpen((prev) =>
          prev &&
          prev.match.from === match.from &&
          prev.match.query === match.query &&
          prev.left === at.left &&
          prev.top === at.top
            ? prev
            : { match, left: at.left, top: at.top, bottom: at.bottom },
        );
      },
      onKeyDown(event) {
        const { items, index, open, editor } = live.current;
        if (!open || !editor || items.length === 0) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1;
          setIndex((index + step + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          items[index]?.run(editor, open.match);
          return true;
        }
        return false;
      },
    }),
    [],
  );

  const bind = (editor: Editor | null) => {
    live.current.editor = editor;
  };

  return { options, bind, open, items, index, setIndex };
}

export function SlashMenu({
  editor,
  open,
  items,
  index,
  setIndex,
}: {
  editor: Editor | null;
  open: Open | null;
  items: SlashItem[];
  index: number;
  setIndex: (i: number) => void;
}) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open || !editor || items.length === 0) return null;

  // Below the caret, or above it when there is no room; never off the right edge.
  const below = open.bottom + GAP + MENU_MAX_HEIGHT <= window.innerHeight;
  const style = {
    left: Math.max(GAP, Math.min(open.left, window.innerWidth - MENU_WIDTH - GAP)),
    ...(below ? { top: open.bottom + GAP } : { bottom: window.innerHeight - open.top + GAP }),
  };

  return createPortal(
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label="Insert a block"
      className="menu fixed z-50 max-h-80 w-60 overflow-y-auto"
      style={style}
    >
      {items.map((item, i) => (
        <div
          key={item.id}
          role="option"
          tabIndex={-1}
          aria-selected={i === index}
          data-index={i}
          className={cx(
            "menu__item h-9 cursor-default select-none transition-colors duration-150",
            i === index && "bg-surface-300",
          )}
          // mousedown, not click: keep the editor focused and the caret where it is.
          onMouseDown={(e) => {
            e.preventDefault();
            item.run(editor, open.match);
          }}
          onMouseEnter={() => setIndex(i)}
        >
          <span
            aria-hidden="true"
            className="grid size-6 flex-none place-items-center rounded-sm border border-border-subtle bg-surface-100 type-caption text-ink-muted"
          >
            {item.glyph}
          </span>
          <span className="flex-1 truncate">{item.label}</span>
          {item.hint && <kbd>{item.hint}</kbd>}
        </div>
      ))}
    </div>,
    document.body,
  );
}
