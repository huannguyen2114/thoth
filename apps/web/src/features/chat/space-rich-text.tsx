"use client";

import { Fragment, useMemo } from "react";
import { type Inline, parseBlocks } from "./markdown-lite";
import { SpaceLinkChip } from "./space-link-chip";

/**
 * A space chat answer: the chat Markdown subset, with `[label](thoth:…)` links as chips that open
 * the cited content (doc 22). Bare citation tokens have no content to jump in, so they stay text.
 */
export function SpaceRichText({ text }: { text: string }) {
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

const LINK = /\[([^\]\n]*)\]\((thoth:[^)\s]+)\)/g;

function Linked({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    const start = m.index ?? 0;
    if (start > at) out.push(text.slice(at, start));
    out.push(<SpaceLinkChip key={`k-${start}`} href={m[2] ?? ""} label={m[1] ?? ""} />);
    at = start + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => {
    const key = `${n.type}-${i}`;
    switch (n.type) {
      case "text":
        return <Linked key={key} text={n.text} />;
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
        return <Fragment key={key}>{n.raw}</Fragment>;
    }
  });
}
