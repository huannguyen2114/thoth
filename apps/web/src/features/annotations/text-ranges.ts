import { type Annotation, findQuote, type Locator } from "@thoth/core";

/**
 * Text views (transcript, text viewer, summary) find their highlights again by quote (ADR-0038),
 * so a highlight survives as long as its passage does. Pure helpers, unit tested.
 */

export interface Mark {
  start: number;
  end: number;
  id: string;
  color: Annotation["color"];
  comment: boolean;
}

/** Whether an annotation's locator is in this segment: same page, paragraph or time range. */
export function locatorIn(a: Locator | null, seg: Locator, segIdx: number): boolean {
  if (!a) return false;
  if (a.type === "page" && seg.type === "page") return a.page === seg.page;
  if (a.type === "time" && seg.type === "time") {
    return a.startSec >= seg.startSec && (a.startSec < seg.endSec || a.startSec === seg.startSec);
  }
  if (a.type === "offset" && seg.type === "offset") {
    return (a.paragraph ?? -1) === (seg.paragraph ?? segIdx + 1);
  }
  return false;
}

/** Highlights of `annotations` inside one block of text, sorted and without overlaps. */
export function marksIn(
  text: string,
  annotations: (Pick<Annotation, "color" | "comment" | "anchor" | "payload"> & { id: string })[],
): Mark[] {
  const marks: Mark[] = [];
  for (const a of annotations) {
    const q = a.anchor.quote;
    if (!q || a.payload) continue;
    const at = findQuote(text, q) ?? findQuote(text, { ...q, exact: q.exact.trim() });
    if (at) marks.push({ ...at, id: a.id, color: a.color, comment: Boolean(a.comment) });
  }
  marks.sort((x, y) => x.start - y.start || y.end - x.end);
  const out: Mark[] = [];
  for (const m of marks) {
    const last = out.at(-1);
    if (last && m.start < last.end) {
      if (m.end > last.end) out.push({ ...m, start: last.end });
    } else out.push(m);
  }
  return out;
}

/** Splits text into plain and marked pieces for rendering. */
export function pieces(text: string, marks: Mark[]): { text: string; mark: Mark | null }[] {
  const out: { text: string; mark: Mark | null }[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) out.push({ text: text.slice(at, m.start), mark: null });
    out.push({ text: text.slice(m.start, m.end), mark: m });
    at = m.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: null });
  return out;
}

/** A quote short enough for a link's `?q=`: the first words, cut at a word, at most `max`. */
export function linkQuote(exact: string, max = 100): string {
  const t = exact.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return space > max / 2 ? cut.slice(0, space) : cut;
}

/**
 * Finds `quote` in the text under `root`, ignoring differences in whitespace, and returns a DOM
 * Range over it. Used to flash a passage after a jump.
 */
export function findTextRange(root: Node, quote: string): Range | null {
  const want = quote.replace(/\s+/g, " ").trim().toLowerCase();
  if (!want) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  // Flattened text with single spaces, and for each char the node and offset it came from.
  let flat = "";
  const map: { node: number; offset: number }[] = [];
  let lastSpace = true;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const i = nodes.push(t) - 1;
    const s = t.data;
    for (let k = 0; k < s.length; k++) {
      const ch = s[k] ?? "";
      if (/\s/.test(ch)) {
        if (lastSpace) continue;
        flat += " ";
        lastSpace = true;
      } else {
        flat += ch.toLowerCase();
        lastSpace = false;
      }
      map.push({ node: i, offset: k });
    }
  }
  const at = flat.indexOf(want);
  if (at === -1) return null;
  const a = map[at];
  const b = map[at + want.length - 1];
  const na = a && nodes[a.node];
  const nb = b && nodes[b.node];
  if (!a || !b || !na || !nb) return null;
  const range = document.createRange();
  range.setStart(na, a.offset);
  range.setEnd(nb, b.offset + 1);
  return range;
}

/** Briefly paints a range with the CSS highlight API, or flashes its block where unsupported. */
export function flashRange(range: Range, fallback: (el: Element) => void) {
  const registry = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
  const H = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (registry && H) {
    registry.set("thoth-flash", new H(range));
    window.setTimeout(() => registry.delete("thoth-flash"), 1600);
    return;
  }
  const el = range.startContainer.parentElement;
  if (el) fallback(el);
}
