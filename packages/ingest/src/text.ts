import type { NewSegment } from "@thoth/core";

/**
 * Splits plain text into paragraph segments with `{ type: "offset" }` locators.
 *
 * Offsets are character positions in the exact string passed in, so
 * `text.slice(locator.start, locator.end) === segment.text`.
 *
 * - Paragraphs are separated by blank lines. Text with no blank lines falls back to single
 *   line breaks.
 * - Very short paragraphs (headings, one-liners) are merged into the next one, so every
 *   segment carries enough text for search and chapters.
 * - Very long paragraphs are split at sentence ends.
 */
export interface ParagraphOptions {
  /** A segment shorter than this absorbs the next paragraph. */
  minChars?: number;
  /** A paragraph longer than this is split at sentence boundaries. */
  maxChars?: number;
}

interface Span {
  start: number;
  end: number;
}

const DEFAULTS = { minChars: 200, maxChars: 2000 };

export function paragraphSegments(text: string, options: ParagraphOptions = {}): NewSegment[] {
  const { minChars, maxChars } = { ...DEFAULTS, ...options };
  let spans = splitSpans(text, /\n[ \t]*\n/g);
  if (spans.length === 1 && spanLength(spans) > maxChars) spans = splitSpans(text, /\n/g);

  const merged = mergeShort(spans, minChars, maxChars);
  const sized = merged.flatMap((s) => splitLong(text, s, maxChars));
  return sized.map((s, idx) => ({
    idx,
    text: text.slice(s.start, s.end),
    locator: { type: "offset", start: s.start, end: s.end },
  }));
}

/** Spans between separators, trimmed of surrounding whitespace, empty ones dropped. */
function splitSpans(text: string, separator: RegExp): Span[] {
  const spans: Span[] = [];
  let cursor = 0;
  for (const match of text.matchAll(separator)) {
    pushTrimmed(text, cursor, match.index, spans);
    cursor = match.index + match[0].length;
  }
  pushTrimmed(text, cursor, text.length, spans);
  return spans;
}

function pushTrimmed(text: string, start: number, end: number, out: Span[]) {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text.charAt(s))) s++;
  while (e > s && /\s/.test(text.charAt(e - 1))) e--;
  if (e > s) out.push({ start: s, end: e });
}

const spanLength = (spans: Span[]) => spans.reduce((n, s) => n + (s.end - s.start), 0);

function mergeShort(spans: Span[], minChars: number, maxChars: number): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const last = out.at(-1);
    if (last && last.end - last.start < minChars && span.end - last.start <= maxChars) {
      last.end = span.end;
    } else {
      out.push({ ...span });
    }
  }
  // A short tail joins the segment before it.
  const tail = out.at(-1);
  const prev = out.at(-2);
  if (tail && prev && tail.end - tail.start < minChars && tail.end - prev.start <= maxChars) {
    prev.end = tail.end;
    out.pop();
  }
  return out;
}

function splitLong(text: string, span: Span, maxChars: number): Span[] {
  const out: Span[] = [];
  let start = span.start;
  while (span.end - start > maxChars) {
    const window = text.slice(start, start + maxChars);
    // Last sentence end in the window, but not in its first half.
    let cut = -1;
    for (const m of window.matchAll(/[.!?]["')\]]?\s+/g)) {
      if (m.index > maxChars / 2) cut = m.index + m[0].length;
    }
    if (cut === -1)
      cut = window.lastIndexOf(" ") > maxChars / 2 ? window.lastIndexOf(" ") : maxChars;
    const chunk: Span[] = [];
    pushTrimmed(text, start, start + cut, chunk);
    out.push(...chunk);
    start += cut;
  }
  pushTrimmed(text, start, span.end, out);
  return out;
}

/** Collapses runs of spaces and tabs, trims each line, and keeps paragraph breaks. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A title from the first line of text, cut at a word boundary. */
export function titleFromText(text: string, maxChars = 80): string {
  const first = text.trim().split("\n")[0]?.trim() ?? "";
  if (first.length <= maxChars) return first;
  const cut = first.slice(0, maxChars);
  const space = cut.lastIndexOf(" ");
  return `${(space > maxChars / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
