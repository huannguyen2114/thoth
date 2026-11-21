import type { Annotation } from "../../domain/annotation";
import { formatClock } from "../../domain/citation";
import type { Locator } from "../../domain/content";

const TITLE_MAX = 28;

/** A content title cut to fit in a chip: "Lecture 2: Thermodynamics and…" */
export function shortTitle(title: string, max = TITLE_MAX): string {
  const t = title.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.:;–-]+$/, "")}…`;
}

/** "p.3", "03:21" or "§4": where a locator points, as a chip shows it. */
export function placeLabel(locator: Locator | null): string | null {
  if (!locator) return null;
  switch (locator.type) {
    case "page":
      return `p.${locator.page}`;
    case "time":
      return formatClock(locator.startSec);
    case "offset":
      return locator.paragraph ? `§${locator.paragraph}` : null;
  }
}

/**
 * The text of a link chip (doc 21): "Lecture 2 · p.3". `title` is the target content's title;
 * `place` is a page, time or paragraph, or a passage name like "Summary".
 */
export function linkLabel(title: string, place?: string | null): string {
  const t = shortTitle(title);
  return place ? `${t} · ${place}` : t;
}

/** The chip label for a link to an annotation. */
export function annotationLinkLabel(title: string, a: Pick<Annotation, "anchor">): string {
  return linkLabel(title, placeLabel(a.anchor.locator));
}
