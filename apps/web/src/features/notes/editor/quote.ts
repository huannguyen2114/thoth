import type { JSONContent } from "@tiptap/react";
import { cleanLabel } from "./thoth-link";

/** The blocks for a quote sent to notes: `> passage [label](href)` and a paragraph after it. */
export function quoteBlocks(text: string, href: string, label: string): JSONContent[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const last = paragraphs.length - 1;
  return [
    {
      type: "blockquote",
      content: paragraphs.map((p, i) => ({
        type: "paragraph",
        content: [
          { type: "text", text: i === last ? `${p} ` : p },
          ...(i === last
            ? [{ type: "thothLink", attrs: { href, label: cleanLabel(label) } }]
            : []),
        ],
      })),
    },
    { type: "paragraph" },
  ];
}
