"use client";

import {
  type AnnotationColor,
  formatLink,
  type Locator,
  linkLabel,
  locatorSchema,
  placeLabel,
  type TextQuote,
} from "@thoth/core";
import { cx } from "@thoth/ui";
import { type ReactNode, type RefObject, useCallback, useEffect, useState } from "react";
import type { AnnotationDto } from "./actions";
import { type AnchorRect, AnnotationToolbar, type PassageActions } from "./annotation-toolbar";
import { useAnnotationBacklinks } from "./backlinks";
import { COLORS } from "./colors";
import { useAnnotations } from "./store";
import { linkQuote, type Mark, pieces } from "./text-ranges";
import { usePassage } from "./use-passage";
import "./annotations.css";

/**
 * Selecting text in a text view (doc 21): the transcript, the text viewer, Chapters and the
 * Summary panel. Each passage block marks its text element with `data-passage-key` and, for a
 * source, `data-passage-loc` (its locator as JSON). The hook shows the selection toolbar and
 * the toolbar of a clicked highlight.
 */

/** Text with its highlights as `<mark>`s. Clicking a mark opens its toolbar. */
export function PassageText({
  text,
  marks,
  className,
  passageKey,
  locator,
}: {
  text: string;
  marks: Mark[];
  className?: string;
  passageKey: string;
  locator?: Locator | null;
}) {
  return (
    <span
      className={className}
      data-passage-key={passageKey}
      data-passage-loc={locator ? JSON.stringify(locator) : undefined}
    >
      {marks.length === 0
        ? text
        : pieces(text, marks).map((p, i) =>
            p.mark ? (
              <mark
                // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one text, in order
                key={i}
                data-annotation-id={p.mark.id}
                className={cx(
                  "cursor-pointer rounded-sm text-inherit transition-colors duration-150",
                  COLORS[p.mark.color].mark,
                  p.mark.comment && "underline decoration-dotted underline-offset-4",
                )}
              >
                {p.text}
              </mark>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one text, in order
              <span key={i}>{p.text}</span>
            ),
          )}
    </span>
  );
}

interface TextSelection {
  quote: TextQuote;
  locator: Locator | null;
  anchor: AnchorRect;
}

type Pop =
  | ({ kind: "selection" } & TextSelection)
  | { kind: "annotation"; id: string; anchor: AnchorRect };

const rectOf = (r: DOMRect): AnchorRect => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

/** The selected passage inside one `data-passage-key` block of `root`, or null. */
export function readTextSelection(root: HTMLElement): TextSelection | null {
  const s = window.getSelection();
  if (!s || s.isCollapsed || s.rangeCount === 0) return null;
  const range = s.getRangeAt(0);
  const node = range.startContainer;
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const block = el?.closest<HTMLElement>("[data-passage-key]");
  if (!block || !root.contains(block)) return null;
  // A selection that runs past its block is cut at the block's end.
  const clipped = range.cloneRange();
  if (!block.contains(range.endContainer)) clipped.setEnd(block, block.childNodes.length);
  const raw = clipped.toString();
  const exact = raw.trim();
  if (!exact) return null;
  const full = block.textContent ?? "";
  const before = document.createRange();
  before.setStart(block, 0);
  before.setEnd(clipped.startContainer, clipped.startOffset);
  const start = before.toString().length + (raw.length - raw.trimStart().length);
  const end = start + exact.length;
  let locator: Locator | null = null;
  try {
    const parsed = locatorSchema.safeParse(JSON.parse(block.dataset.passageLoc ?? "null"));
    locator = parsed.success ? parsed.data : null;
  } catch {}
  return {
    quote: {
      exact: exact.slice(0, 2000),
      prefix: full.slice(Math.max(0, start - 32), start),
      suffix: full.slice(end, end + 32),
    },
    locator,
    anchor: rectOf(clipped.getBoundingClientRect()),
  };
}

/** The `[label](thoth:...)` for a passage of a source or of a summary. */
function passageLink(
  contentId: string,
  title: string,
  sel: { quote: TextQuote; locator: Locator | null },
  setId: string | null,
) {
  const quote = { exact: linkQuote(sel.quote.exact), prefix: "", suffix: "" };
  if (setId) {
    return {
      href: formatLink({ kind: "set", setId: setId as never, quote }),
      label: linkLabel(title, "Summary"),
    };
  }
  return {
    href: formatLink({
      kind: "content",
      contentId: contentId as never,
      locator: sel.locator,
      quote,
    }),
    label: linkLabel(title, placeLabel(sel.locator)),
  };
}

/**
 * Selection and highlight toolbars for a text view. `setId` makes it a summary: passages link
 * to the summary and are not stored as highlights (an annotation belongs to its source).
 */
export function useTextPassages({
  contentId,
  root,
  setId = null,
}: {
  contentId: string;
  root: RefObject<HTMLElement | null>;
  setId?: string | null;
}): { toolbar: ReactNode; items: AnnotationDto[] } {
  const ann = useAnnotations(contentId);
  const passage = usePassage(contentId);
  const [pop, setPop] = useState<Pop | null>(null);

  // Open the bar when a selection ends inside the view; a click on a mark opens its bar.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onUp = (e: Event) => {
      window.setTimeout(() => {
        const sel = readTextSelection(el);
        if (sel) return setPop({ kind: "selection", ...sel });
        if (e.type !== "pointerup" || setId) return;
        const mark = (e.target as Element | null)?.closest?.<HTMLElement>(
          "mark[data-annotation-id]",
        );
        const id = mark?.dataset.annotationId;
        if (mark && id)
          setPop({ kind: "annotation", id, anchor: rectOf(mark.getBoundingClientRect()) });
      }, 0);
    };
    const onKey = (e: KeyboardEvent) => e.shiftKey && onUp(e);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("keyup", onKey);
    return () => {
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("keyup", onKey);
    };
  }, [root, setId]);

  useEffect(() => {
    if (pop?.kind !== "selection") return;
    const onChange = () => {
      if (window.getSelection()?.isCollapsed) setPop(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [pop?.kind]);

  const close = useCallback(() => setPop(null), []);
  const current =
    pop?.kind === "annotation" ? (ann.items.find((a) => a.id === pop.id) ?? null) : null;
  const quotedIn = useAnnotationBacklinks(contentId, current?.id ?? null);
  const clear = () => window.getSelection()?.removeAllRanges();

  let actions: PassageActions | null = null;
  if (pop?.kind === "selection") {
    const sel = pop;
    const highlight = (color: AnnotationColor, comment: string | null = null) =>
      ann.create({
        kind: "highlight",
        anchor: { kind: "content", contentId, locator: sel.locator, quote: sel.quote },
        color,
        comment,
      });
    actions = {
      ...(setId
        ? {}
        : {
            onColor: (c: AnnotationColor) => {
              void highlight(c);
              clear();
              setPop(null);
            },
            onComment: (text: string) => {
              void highlight("yellow", text.trim() || null);
              clear();
              setPop(null);
            },
          }),
      onAddToNotes: () => {
        const { href, label } = passageLink(contentId, ann.title, sel, setId);
        passage.addToNotes(sel.quote.exact, href, label);
        clear();
        setPop(null);
      },
      onFlashcard: (suggest) =>
        passage.flashcard({ quote: sel.quote.exact, locator: sel.locator }, suggest),
    };
  } else if (current) {
    actions = {
      onColor: (c) => void ann.update(current.id, { color: c }),
      onComment: (text) => void ann.update(current.id, { comment: text.trim() || null }),
      onAddToNotes: () => {
        passage.addToNotes(
          current.anchor.quote?.exact ?? current.comment ?? "",
          `thoth:a/${current.id}`,
          linkLabel(ann.title, placeLabel(current.anchor.locator)),
        );
        setPop(null);
      },
      onFlashcard: (suggest) => passage.flashcard({ annotationId: current.id }, suggest),
      onDelete: () => {
        void ann.remove(current.id);
        setPop(null);
      },
    };
  }

  const toolbar =
    pop && actions ? (
      <AnnotationToolbar
        key={pop.kind === "annotation" ? pop.id : "selection"}
        anchor={pop.anchor}
        current={current}
        actions={actions}
        quotedIn={quotedIn}
        onOpenBacklink={(s) => {
          passage.openBacklink(s);
          setPop(null);
        }}
        onClose={close}
      />
    ) : null;

  return { toolbar, items: ann.items };
}
