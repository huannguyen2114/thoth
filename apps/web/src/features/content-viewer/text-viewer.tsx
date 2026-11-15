"use client";

import type { Segment } from "@thoth/core";
import { useEffect, useRef } from "react";
import { flash, useViewer } from "./viewer-context";

/** DOM ids the viewer jumps to. Paragraph numbers are 1-based, like `[§n]` in prompts. */
export const pageAnchor = (page: number) => `source-page-${page}`;
export const paragraphAnchor = (n: number) => `source-para-${n}`;

/**
 * The source as text. Used for a PDF that has no stored file (the seed), and for web pages
 * and pasted text. Pages render as sheets; paragraphs carry a `§n` marker.
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

  useEffect(() => {
    const show = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      flash(el);
    };
    register({
      showPage: (page) => show(pageAnchor(page)),
      showParagraph: (n) => show(paragraphAnchor(n)),
    });
    return () => register(null);
  }, [register]);

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

  if (mode === "pages") {
    return (
      <div ref={root} className="flex flex-col gap-4">
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
              <p className="type-overline mb-3 text-ink-muted">Page {page}</p>
              <p className="type-body-lg whitespace-pre-line text-ink">{s.text}</p>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={root} className="mx-auto flex max-w-2xl flex-col gap-4">
      {segments.map((s) => {
        const n = s.idx + 1;
        return (
          <p
            key={s.id}
            id={paragraphAnchor(n)}
            data-n={n}
            className="type-body-lg scroll-mt-4 rounded-md px-2 py-1 whitespace-pre-line text-ink transition-colors"
          >
            <span className="type-caption mr-2 text-ink-muted select-none">§{n}</span>
            {s.text}
          </p>
        );
      })}
    </div>
  );
}
