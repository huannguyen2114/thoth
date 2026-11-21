"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { revealQuote } from "@/features/content-viewer/text-viewer";
import { onSetQuote, takePendingSetQuote } from "./set-quote";
import { useTextPassages } from "./text-passages";

/**
 * Wraps the open summary (doc 21): selecting text offers Add to notes (a `thoth:s/<id>?q=` link)
 * and Make flashcard, and a summary link chip opens this set and flashes its passage.
 * `onOpenSet` switches the panel to another set when a link points there.
 */
export function SummaryPassages({
  contentId,
  setId,
  onOpenSet,
  children,
}: {
  contentId: string;
  setId: string;
  onOpenSet: (setId: string) => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { toolbar } = useTextPassages({ contentId, root, setId });
  const openSet = useRef(onOpenSet);
  openSet.current = onOpenSet;

  useEffect(
    () =>
      onSetQuote((id, quote) => {
        if (id !== setId) {
          // Another set: open it; its own mount takes the request when it renders.
          openSet.current(id);
          return false;
        }
        if (quote) window.setTimeout(() => revealQuote(root.current, quote), 150);
        return true;
      }),
    [setId],
  );

  // A request that arrived before this set was open (the panel was closed, or another set).
  useEffect(() => {
    const p = takePendingSetQuote(setId);
    if (p?.quote) {
      const quote = p.quote;
      window.setTimeout(() => revealQuote(root.current, quote), 300);
    }
  }, [setId]);

  return (
    <div ref={root} data-passage-key={setId}>
      {children}
      {toolbar}
    </div>
  );
}
