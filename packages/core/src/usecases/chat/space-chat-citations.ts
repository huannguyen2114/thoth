import { formatClock } from "../../domain/citation";
import type { ContentKind, Locator } from "../../domain/content";
import { formatLink, parseLocatorParam } from "../../domain/link";
import type { ContentId } from "../../shared/id";

/**
 * Space chat citations (ADR-0039, doc 22). The model sees sources labelled S1..Sn and cites
 * `[S2 p.3]`, `[S1 03:21]`, `[S3 §2]` or just `[S2]`. Before an answer is saved, each citation
 * becomes a `thoth:` link, `[Title · p.3](thoth:c/<id>?at=p.3)`, so a stored answer names the
 * content it cites and every chip opens the right content at the right spot.
 *
 * Pure, so the browser can show the same chips while the answer is still streaming.
 */
export interface SpaceSource {
  /** "S1", "S2", … in the order the sources appear in the prompt. */
  label: string;
  contentId: ContentId;
  title: string;
  kind: ContentKind;
}

/** `[S2 p.3]`, `[S1, 03:21]`, `[S3 §2]`, `[S1]`, `[S1 p.2; S2 §4]`. Never one already linked. */
const CITE = /\[(S\d+\b[^\]\n]{0,80})\](?!\()/g;
const PART = /^S(\d+)(?:[\s,:·-]+(.*))?$/;

/** The short place label for a chip: "p.3", "03:21", "§2". */
export function locatorShort(locator: Locator): string {
  switch (locator.type) {
    case "page":
      return `p.${locator.page}`;
    case "time":
      return formatClock(locator.startSec);
    case "offset":
      return `§${locator.paragraph ?? 1}`;
  }
}

/** "p 3", "page 3", "pp. 3-4", "par. 2" → a locator the link format understands. */
function locatorFrom(raw: string): Locator | null {
  const v = raw.trim().replace(/[.,;]+$/, "");
  if (!v) return null;
  const direct = parseLocatorParam(v);
  if (direct) return direct;
  const page = /^(?:p|pp|page|pages)\.?\s*(\d+)/i.exec(v);
  if (page) return parseLocatorParam(`p.${page[1]}`);
  const par = /^(?:§|par\.?|para\.?|paragraph)\s*(\d+)/i.exec(v);
  if (par) return parseLocatorParam(`§${par[1]}`);
  const clock = /^(\d{1,2}(?::\d{2}){1,2})/.exec(v);
  if (clock?.[1]) return parseLocatorParam(clock[1]);
  return null;
}

/** Brackets would end the link label early; keep titles readable and the Markdown valid. */
const cleanLabel = (s: string) =>
  s
    .replace(/[[\]\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** One citation part as a Markdown `thoth:` link, or null when it names no known source. */
function linkFor(part: string, sources: ReadonlyMap<number, SpaceSource>): string | null {
  const m = PART.exec(part.trim());
  if (!m) return null;
  const source = sources.get(Number(m[1]));
  if (!source) return null;
  const locator = m[2] ? locatorFrom(m[2]) : null;
  const title = cleanLabel(source.title) || source.label;
  const label = locator ? `${title} · ${locatorShort(locator)}` : title;
  return `[${label}](${formatLink({ kind: "content", contentId: source.contentId, locator })})`;
}

/**
 * Rewrites every `[Sn …]` citation into `thoth:` links. A citation of an unknown source
 * (`[S9]` with three sources) is dropped rather than shown as a broken chip; anything that is
 * not a citation (`[see below]`) is left as it was.
 */
export function linkSpaceCitations(text: string, sources: readonly SpaceSource[]): string {
  const byNumber = new Map<number, SpaceSource>();
  for (const s of sources) byNumber.set(Number(s.label.slice(1)), s);
  return text.replace(CITE, (whole, inner: string) => {
    const parts = inner.split(/\s*;\s*|,\s*(?=S\d)/);
    if (!parts.every((p) => PART.test(p.trim()))) return whole;
    return parts
      .map((p) => linkFor(p, byNumber))
      .filter((l): l is string => l !== null)
      .join(" ");
  });
}
