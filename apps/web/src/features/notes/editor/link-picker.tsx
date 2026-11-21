"use client";

import type { LinkTarget } from "@thoth/core";
import { cx } from "@thoth/ui";
import type { Editor } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchLinkTargetsAction } from "@/features/annotations/actions";
import { openThothLink } from "@/features/annotations/open-link";
import { useOptionalViewer } from "@/features/content-viewer/viewer-context";
import { applyNotesRequest, attachNotes } from "./bridge";
import type { LinkMatch, LinkTriggerOptions } from "./link-trigger";
import type { ThothLinkOptions } from "./thoth-link";

interface Open {
  match: LinkMatch;
  left: number;
  top: number;
  bottom: number;
}

const MENU_MAX_HEIGHT = 360;
const MENU_WIDTH = 320;
const GAP = 4;
const DEBOUNCE_MS = 150;

/** `content:<id>` → the content id; a space's notes have none. */
export const contentOfOwner = (ownerKey: string) =>
  ownerKey.startsWith("content:") ? ownerKey.slice("content:".length) : null;

/**
 * Everything links need in a notes editor (doc 21): the `[[` / `@` picker, opening chips, and the
 * bridge that lets "Add to notes" and backlinks reach this editor. Exported for space notes.
 *
 * Pass `extensionOptions` to `notesExtensions` once (they are stable), call `bind(editor)` after
 * `useEditor`, and render `<NotesLinksLayer links={...} editor={...} loaded={...} />`.
 */
export function useNotesLinks(ownerKey: string) {
  const router = useRouter();
  const viewer = useOptionalViewer();
  const contentId = contentOfOwner(ownerKey);
  const [open, setOpen] = useState<Open | null>(null);
  const [items, setItems] = useState<LinkTarget[]>([]);
  const [index, setIndex] = useState(0);
  const live = useRef({ items, index, open, editor: null as Editor | null });
  live.current = { ...live.current, items, index, open };
  const ctx = useRef({ contentId, viewer, router });
  ctx.current = { contentId, viewer, router };

  const pick = useCallback((target: LinkTarget) => {
    const { editor, open } = live.current;
    if (!editor || !open) return;
    editor
      .chain()
      .focus()
      .deleteRange(open.match)
      .insertThothLink({ href: target.href, label: target.chipLabel })
      .insertContent(" ")
      .run();
  }, []);

  const options = useMemo<LinkTriggerOptions>(
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
        const { items, index, open } = live.current;
        if (!open || items.length === 0) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1;
          setIndex((index + step + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const it = items[index];
          if (it) pick(it);
          return true;
        }
        return false;
      },
    }),
    [pick],
  );

  const onOpenLink = useCallback<ThothLinkOptions["onOpen"]>(
    (href) =>
      openThothLink(href, {
        contentId: ctx.current.contentId,
        jumpTo: ctx.current.viewer?.jumpTo,
        navigate: (to) => ctx.current.router.push(to),
      }),
    [],
  );

  // Search as the query changes; the newest answer wins.
  const query = open?.match.query;
  const isOpen = open !== null;
  useEffect(() => {
    if (!isOpen) {
      setItems([]);
      return;
    }
    let stale = false;
    const t = window.setTimeout(() => {
      searchLinkTargetsAction(query ?? "", contentId)
        .then((r) => {
          if (stale) return;
          setItems(r);
          setIndex(0);
        })
        .catch(() => !stale && setItems([]));
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      window.clearTimeout(t);
    };
  }, [isOpen, query, contentId]);

  const bind = (editor: Editor | null) => {
    live.current.editor = editor;
  };

  return {
    ownerKey,
    extensionOptions: options,
    onOpenLink,
    bind,
    open,
    items,
    index,
    setIndex,
    pick,
  };
}

export type NotesLinks = ReturnType<typeof useNotesLinks>;

/** The picker, plus the bridge for "Add to notes" and backlinks once the note has loaded. */
export function NotesLinksLayer({
  links,
  editor,
  loaded,
}: {
  links: NotesLinks;
  editor: Editor | null;
  loaded: boolean;
}) {
  const { ownerKey } = links;
  useEffect(() => {
    if (!editor || !loaded) return;
    return attachNotes(ownerKey, (req) => applyNotesRequest(editor, req));
  }, [editor, loaded, ownerKey]);
  return <LinkPicker links={links} />;
}

function LinkPicker({ links }: { links: NotesLinks }) {
  const { open, items, index, setIndex, pick } = links;
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const below = open.bottom + GAP + MENU_MAX_HEIGHT <= window.innerHeight;
  const style = {
    left: Math.max(GAP, Math.min(open.left, window.innerWidth - MENU_WIDTH - GAP)),
    ...(below ? { top: open.bottom + GAP } : { bottom: window.innerHeight - open.top + GAP }),
  };

  let lastGroup = "";
  return createPortal(
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label="Link to"
      className="menu fixed z-50 max-h-90 w-80 overflow-y-auto"
      style={style}
    >
      {items.length === 0 ? (
        <p className="type-caption px-3 py-2 text-ink-muted select-none">
          {open.match.query ? "Nothing matches yet. Keep typing." : "Type to search your sources."}
        </p>
      ) : (
        items.map((item, i) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <div key={item.id}>
              {header && (
                <p className="type-overline px-3 pt-2 pb-1 text-ink-muted select-none">{header}</p>
              )}
              <div
                role="option"
                tabIndex={-1}
                aria-selected={i === index}
                data-index={i}
                className={cx(
                  "menu__item min-h-9 cursor-default flex-col items-start gap-0 py-1.5 select-none transition-colors duration-150",
                  i === index && "bg-surface-300",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                onMouseEnter={() => setIndex(i)}
              >
                <span className="w-full truncate">{item.label}</span>
                {item.detail && (
                  <span className="type-caption w-full truncate text-ink-muted">{item.detail}</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>,
    document.body,
  );
}
