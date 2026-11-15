"use client";

import { type CitationRef, formatClock } from "@thoth/core";
import { Fragment, useMemo } from "react";
import { useViewer } from "@/features/content-viewer/viewer-context";
import { type Inline, parseBlocks } from "./markdown-lite";

/** An answer with citation chips. Clicking a chip jumps the viewer (seek, page, paragraph). */
export function RichText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        const key = `${b.type}-${i}`;
        if (b.type === "heading") {
          return (
            <p key={key} className="type-body-strong text-ink">
              <Inlines nodes={b.children} />
            </p>
          );
        }
        if (b.type === "p") {
          return (
            <p key={key}>
              {b.lines.map((line, j) => (
                <Fragment key={`l-${j.toString()}`}>
                  {j > 0 && <br />}
                  <Inlines nodes={line} />
                </Fragment>
              ))}
            </p>
          );
        }
        const List = b.type === "ul" ? "ul" : "ol";
        return (
          <List
            key={key}
            className={
              b.type === "ul"
                ? "flex list-disc flex-col gap-1 pl-6"
                : "flex list-decimal flex-col gap-1 pl-6"
            }
          >
            {b.items.map((item, j) => (
              <li key={`i-${j.toString()}`}>
                <Inlines nodes={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => {
    const key = `${n.type}-${i}`;
    switch (n.type) {
      case "text":
        return <Fragment key={key}>{n.text}</Fragment>;
      case "bold":
        return (
          <strong key={key} className="font-semibold">
            <Inlines nodes={n.children} />
          </strong>
        );
      case "code":
        return (
          <code key={key} className="inline">
            {n.text}
          </code>
        );
      default:
        return <CitationChip key={key} citation={n.ref} />;
    }
  });
}

export function citationLabel(ref: CitationRef): { short: string; long: string } {
  switch (ref.type) {
    case "page":
      return { short: `p. ${ref.page}`, long: `Go to page ${ref.page}` };
    case "time": {
      const clock = formatClock(ref.sec);
      return { short: clock, long: `Play from ${clock}` };
    }
    case "paragraph":
      return { short: `§${ref.index}`, long: `Go to paragraph ${ref.index}` };
  }
}

export function CitationChip({ citation }: { citation: CitationRef }) {
  const { jump } = useViewer();
  const label = citationLabel(citation);
  return (
    <button
      type="button"
      onClick={() => jump(citation)}
      title={label.long}
      aria-label={label.long}
      className="type-caption mx-0.5 inline-flex items-baseline rounded-sm bg-neutral-tint px-1 align-baseline text-ink-muted tabular-nums transition-colors hover:bg-accent-tint hover:text-accent-text"
    >
      {label.short}
    </button>
  );
}
