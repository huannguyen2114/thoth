import { type CitationRef, parseCitations } from "@thoth/core";

/**
 * The small Markdown subset chat answers use (the prompt asks for it): paragraphs, "- " and
 * "1. " lists, **bold**, `code` and citation tokens. Anything else stays plain text, so no
 * HTML from the model ever reaches the page.
 */
export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "cite"; raw: string; ref: CitationRef };

export type Block =
  | { type: "p"; lines: Inline[][] }
  | { type: "ul" | "ol"; items: Inline[][] }
  | { type: "heading"; children: Inline[] };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list = null as { type: "ul" | "ol"; items: string[] } | null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", lines: para.map(parseInline) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: list.type, items: list.items.map(parseInline) });
    list = null;
  };

  for (const line of text.split("\n")) {
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const kind = BULLET.test(line) ? "ul" : NUMBERED.test(line) ? "ol" : null;
    if (kind) {
      flushPara();
      if (list?.type !== kind) {
        flushList();
        list = { type: kind, items: [] };
      }
      list.items.push(line.replace(kind === "ul" ? BULLET : NUMBERED, ""));
      continue;
    }
    if (HEADING.test(line)) {
      flushPara();
      flushList();
      blocks.push({ type: "heading", children: parseInline(line.replace(HEADING, "")) });
      continue;
    }
    // A line right after a list item continues that item.
    if (list && /^\s+/.test(line)) {
      const last = list.items.length - 1;
      list.items[last] = `${list.items[last]} ${line.trim()}`;
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

const SPANS = /`([^`]+)`|\*\*(.+?)\*\*/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(SPANS)) {
    const start = m.index ?? 0;
    out.push(...citations(text.slice(at, start)));
    if (m[1] !== undefined) out.push({ type: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ type: "bold", children: citations(m[2]) });
    at = start + m[0].length;
  }
  out.push(...citations(text.slice(at)));
  return out;
}

function citations(text: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const c of parseCitations(text)) {
    if (c.start > at) out.push({ type: "text", text: text.slice(at, c.start) });
    out.push({ type: "cite", raw: c.raw, ref: c.ref });
    at = c.end;
  }
  if (at < text.length) out.push({ type: "text", text: text.slice(at) });
  return out;
}
