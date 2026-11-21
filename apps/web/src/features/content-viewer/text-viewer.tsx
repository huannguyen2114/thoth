"use client";

import type { Segment } from "@thoth/core";
import { useEffect, useRef } from "react";
import { BacklinksButton } from "@/features/annotations/backlinks";
import { onAnnotationFlash } from "@/features/annotations/store";
import { PassageText, useTextPassages } from "@/features/annotations/text-passages";
import { findTextRange, flashRange, locatorIn, marksIn } from "@/features/annotations/text-ranges";
import { flash, revealInScroller, useViewer } from "./viewer-context";

/** DOM ids the viewer jumps to. Paragraph numbers are 1-based, like `[§n]` in prompts. */
export const pageAnchor = (page: number) => `source-page-${page}`;
export const paragraphAnchor = (n: number) => `source-para-${n}`;

/**
 * Scrolls to the highlight `id` under `root` and flashes it. Returns false when it is not
 * there (another view shows it, or its passage is gone).
 */
export function revealMark(root: HTMLElement | null, id: string): boolean {
  const mark = root?.querySelector<HTMLElement>(`mark[data-annotation-id="${CSS.escape(id)}"]`);
  if (!mark) return false;
  revealInScroller(mark, -48);
  flash(mark, "ring");
  return true;
}

/** Scrolls to a passage under `root` and paints it for a moment. False when not found. */
export function revealQuote(root: HTMLElement | null, quote: string): boolean {
  const range = root ? findTextRange(root, quote) : null;
  if (!range) return false;
  const block = range.startContainer.parentElement?.closest<HTMLElement>("[data-n], li, p");
  if (block) revealInScroller(block);
  flashRange(range, (el) => flash(el));
  return true;
}

/**
 * The source as text. Used for a PDF that has no stored file (the seed), and for web pages
 * and pasted text. Pages render as sheets; paragraphs carry a `§n` marker. Text can be
 * highlighted, commented and sent to notes (doc 21).
 */
export function TextViewer({
  segments,
  mode,
}: {
  segments: Segment[];
  mode: "pages" | "paragraphs";
}) {
  const root = useRef<HTMLDivElement>(null);
  const { register, setPosition } = useViewer();
  const contentId = segments[0]?.contentId ?? "";
  const { toolbar, items } = useTextPassages({ contentId, root });

  useEffect(() => {
    const show = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      revealInScroller(el);
      flash(el);
    };
    register({
      showPage: (page) => show(pageAnchor(page)),
      showParagraph: (n) => show(paragraphAnchor(n)),
      showAnnotation: (id) => revealMark(root.current, id),
      showQuote: (quote) => revealQuote(root.current, quote),
    });
    return () => register(null);
  }, [register]);

  // A jump that arrived before the highlights loaded is shown once they render.
  useEffect(() => onAnnotationFlash((id) => revealMark(root.current, id)), [items]);

  // Report the top-most visible page or paragraph so the Text tab can follow along.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const visible = new Map<Element, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.n);
          if (e.isIntersecting) visible.set(e.target, n);
          else visible.delete(e.target);
        }
        if (visible.size === 0) return;
        const first = Math.min(...visible.values());
        setPosition(
          mode === "pages" ? { type: "page", page: first } : { type: "paragraph", index: first },
        );
      },
      { threshold: 0.3 },
    );
    for (const child of el.querySelectorAll("[data-n]")) io.observe(child);
    return () => io.disconnect();
  }, [mode, setPosition]);

  const marksOf = (s: Segment) =>
    marksIn(
      s.text,
      items.filter((a) => locatorIn(a.anchor.locator, s.locator, s.idx)),
    );

  const header = contentId ? (
    <div className="flex justify-end empty:hidden">
      <BacklinksButton contentId={contentId} />
    </div>
  ) : null;

  if (mode === "pages") {
    return (
      <div ref={root} className="flex flex-col gap-4">
        {header}
        {segments.map((s) => {
          const page = s.locator.type === "page" ? s.locator.page : s.idx + 1;
          return (
            <article
              key={s.id}
              id={pageAnchor(page)}
              data-n={page}
              className="scroll-mt-4 rounded-lg border border-border-subtle bg-surface-200 p-6 transition-colors"
              aria-label={`Page ${page}`}
            >
              <p className="type-overline mb-3 text-ink-muted select-none">Page {page}</p>
              <p className="type-body-lg whitespace-pre-line text-ink">
                <PassageText
                  text={s.text}
                  marks={marksOf(s)}
                  passageKey={s.id}
                  locator={s.locator}
                />
              </p>
            </article>
          );
        })}
        {toolbar}
      </div>
    );
  }

  return (
    <div ref={root} className="mx-auto flex max-w-2xl flex-col gap-4">
      {header}
      {segments.map((s) => {
        const n = s.idx + 1;
        const locator =
          s.locator.type === "offset" ? { ...s.locator, paragraph: s.locator.paragraph ?? n } : s.locator;
        return (
          <p
            key={s.id}
            id={paragraphAnchor(n)}
            data-n={n}
            className="type-body-lg scroll-mt-4 rounded-md px-2 py-1 whitespace-pre-line text-ink transition-colors"
          >
            <span className="type-caption mr-2 text-ink-muted select-none">§{n}</span>
            <PassageText text={s.text} marks={marksOf(s)} passageKey={s.id} locator={locator} />
          </p>
        );
      })}
      {toolbar}
    </div>
  );
}
