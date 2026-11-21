import { z } from "zod";
import type { AnnotationId, ContentId, SpaceId, StudySetId } from "../shared/id";
import { appError, err, ok, type Result } from "../shared/result";
import { parseClock } from "./citation";
import { type Locator, locatorSchema } from "./content";

/**
 * Links between notes, chats and boards and the places they point at (Phase 10, doc 21).
 *
 * A bare citation token such as `[p.3]` still means "this content". A link names its target, so
 * it works from anywhere: another content's notes, a space's notes, a space chat answer.
 *
 * Stored in note Markdown as an ordinary link whose href uses the `thoth:` scheme:
 *
 * | URI                             | Target                                 |
 * | ------------------------------- | -------------------------------------- |
 * | `thoth:c/<contentId>`           | a content                              |
 * | `thoth:c/<contentId>?at=p.3`    | a page (`p.N`), time (`t.SEC`) or paragraph (`par.N`) in it |
 * | `thoth:a/<annotationId>`        | one highlight, drawing or comment      |
 * | `thoth:s/<setId>?q=<quote>`     | a passage of a summary (or other set)  |
 * | `thoth:space/<spaceId>`         | a space                                |
 */

/** W3C-style text quote: finds a passage again after the text around it changes. */
export const textQuoteSchema = z.object({
  exact: z.string().min(1).max(2000),
  prefix: z.string().max(64).default(""),
  suffix: z.string().max(64).default(""),
});
export type TextQuote = z.infer<typeof textQuoteSchema>;

/** A box on a PDF page, in 0..1 page space (x right, y down), so it survives zoom. */
export const normRectSchema = z.object({
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type NormRect = z.infer<typeof normRectSchema>;

export const sourceAnchorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("content"),
    contentId: z.string().min(1),
    /** Null means "the content as a whole". */
    locator: locatorSchema.nullable(),
    quote: textQuoteSchema.optional(),
    rects: z.array(normRectSchema).optional(),
  }),
  z.object({ kind: z.literal("annotation"), annotationId: z.string().min(1) }),
  z.object({ kind: z.literal("set"), setId: z.string().min(1), quote: textQuoteSchema.optional() }),
  z.object({ kind: z.literal("space"), spaceId: z.string().min(1) }),
]);

export type SourceAnchor =
  | {
      kind: "content";
      contentId: ContentId;
      locator: Locator | null;
      quote?: TextQuote;
      rects?: NormRect[];
    }
  | { kind: "annotation"; annotationId: AnnotationId }
  | { kind: "set"; setId: StudySetId; quote?: TextQuote }
  | { kind: "space"; spaceId: SpaceId };

export const LINK_SCHEME = "thoth:";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `p.3`, `t.201`, `par.4`: the `at` value for a locator (the start of a time range). */
export function locatorParam(locator: Locator): string {
  switch (locator.type) {
    case "page":
      return `p.${locator.page}`;
    case "time":
      return `t.${Math.floor(locator.startSec)}`;
    case "offset":
      return `par.${locator.paragraph ?? 1}`;
  }
}

/**
 * Parses an `at` value back into a locator. Also accepts a citation token without brackets
 * (`p.3`, `03:21`, `§2`), so hand-typed links work.
 */
export function parseLocatorParam(at: string): Locator | null {
  const v = at.trim();
  let m = /^p\.(\d+)$/.exec(v);
  if (m) return Number(m[1]) >= 1 ? { type: "page", page: Number(m[1]) } : null;
  m = /^t\.(\d+)$/.exec(v);
  if (m) return { type: "time", startSec: Number(m[1]), endSec: Number(m[1]) };
  if (/^\d{1,2}(?::\d{2}){1,2}$/.test(v)) {
    const sec = parseClock(v);
    return { type: "time", startSec: sec, endSec: sec };
  }
  m = /^(?:par\.|§)(\d+)$/.exec(v);
  if (m && Number(m[1]) >= 1) {
    // A paragraph link carries only its number; viewers jump by `paragraph`.
    return { type: "offset", start: 0, end: 0, paragraph: Number(m[1]) };
  }
  return null;
}

/** The URI for an anchor. Rects never go in a URI: they live on the annotation. */
export function formatLink(anchor: SourceAnchor): string {
  switch (anchor.kind) {
    case "content": {
      const params = new URLSearchParams();
      if (anchor.locator) params.set("at", locatorParam(anchor.locator));
      if (anchor.quote) params.set("q", anchor.quote.exact);
      const qs = params.toString();
      return `${LINK_SCHEME}c/${anchor.contentId}${qs ? `?${qs}` : ""}`;
    }
    case "annotation":
      return `${LINK_SCHEME}a/${anchor.annotationId}`;
    case "set": {
      const qs = anchor.quote ? `?${new URLSearchParams({ q: anchor.quote.exact })}` : "";
      return `${LINK_SCHEME}s/${anchor.setId}${qs}`;
    }
    case "space":
      return `${LINK_SCHEME}space/${anchor.spaceId}`;
  }
}

export function isThothLink(href: string): boolean {
  return href.startsWith(LINK_SCHEME);
}

/** Parses a `thoth:` URI. Expected failures (a hand-edited or foreign link) return an error. */
export function parseLink(href: string): Result<SourceAnchor> {
  const bad = (why: string) => err(appError("validation", `Not a Thoth link: ${why}`));
  if (!isThothLink(href)) return bad("missing thoth: scheme");
  const rest = href.slice(LINK_SCHEME.length);
  const qAt = rest.indexOf("?");
  const path = qAt === -1 ? rest : rest.slice(0, qAt);
  const params = new URLSearchParams(qAt === -1 ? "" : rest.slice(qAt + 1));
  const [kind, id, ...extra] = path.split("/");
  if (!id || extra.length > 0 || !ID.test(id)) return bad("bad id");
  const q = params.get("q");
  const quote: TextQuote | undefined = q ? { exact: q, prefix: "", suffix: "" } : undefined;
  switch (kind) {
    case "c": {
      const at = params.get("at");
      const locator = at ? parseLocatorParam(at) : null;
      if (at && !locator) return bad(`bad position "${at}"`);
      return ok({
        kind: "content",
        contentId: id as ContentId,
        locator,
        ...(quote ? { quote } : {}),
      });
    }
    case "a":
      return ok({ kind: "annotation", annotationId: id as AnnotationId });
    case "s":
      return ok({ kind: "set", setId: id as StudySetId, ...(quote ? { quote } : {}) });
    case "space":
      return ok({ kind: "space", spaceId: id as SpaceId });
    default:
      return bad(`unknown kind "${kind}"`);
  }
}

export interface LinkMatch {
  anchor: SourceAnchor;
  label: string;
  href: string;
  start: number;
  end: number;
}

const MD_LINK = /\[([^\]\n]*)\]\((thoth:[^)\s]+)\)/g;

/** Every valid `[label](thoth:...)` link in a Markdown text, in order. Invalid ones are skipped. */
export function parseLinks(markdown: string): LinkMatch[] {
  const out: LinkMatch[] = [];
  for (const m of markdown.matchAll(MD_LINK)) {
    const href = m[2] ?? "";
    const r = parseLink(href);
    if (!r.ok) continue;
    const start = m.index ?? 0;
    out.push({ anchor: r.value, label: m[1] ?? "", href, start, end: start + m[0].length });
  }
  return out;
}

/** Builds a quote with up to 32 characters of context either side, from a passage in `text`. */
export function quoteAt(text: string, start: number, end: number): TextQuote {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - 32), start),
    suffix: text.slice(end, end + 32),
  };
}

/**
 * Finds a quote in `text`: the exact passage whose surrounding text best matches the prefix
 * and suffix. Returns null when the passage is gone. Pure, so summaries can re-anchor on read.
 */
export function findQuote(text: string, quote: TextQuote): { start: number; end: number } | null {
  let best: { start: number; end: number; score: number } | null = null;
  for (let i = text.indexOf(quote.exact); i !== -1; i = text.indexOf(quote.exact, i + 1)) {
    const end = i + quote.exact.length;
    const score =
      commonSuffix(text.slice(Math.max(0, i - quote.prefix.length), i), quote.prefix) +
      commonPrefix(text.slice(end, end + quote.suffix.length), quote.suffix);
    if (!best || score > best.score) best = { start: i, end, score };
  }
  return best ? { start: best.start, end: best.end } : null;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
