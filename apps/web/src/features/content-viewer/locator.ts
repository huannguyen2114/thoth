import { type CitationRef, formatClock, type Locator } from "@thoth/core";
import type { ViewerPosition } from "./viewer-context";

/** "03:21", "p. 5" or "§4": the short label for a chapter or transcript row. */
export function locatorLabel(locator: Locator, idx: number): string {
  switch (locator.type) {
    case "time":
      return formatClock(locator.startSec);
    case "page":
      return `p. ${locator.page}`;
    case "offset":
      return `§${idx + 1}`;
  }
}

/** The jump target for a locator. Paragraph numbers are 1-based segment indexes. */
export function locatorRef(locator: Locator, idx: number): CitationRef {
  switch (locator.type) {
    case "time":
      return { type: "time", sec: locator.startSec };
    case "page":
      return { type: "page", page: locator.page };
    case "offset":
      return { type: "paragraph", index: idx + 1 };
  }
}

/** A comparable number for a locator or position: seconds, page or paragraph number. */
function startOf(ref: CitationRef): number {
  return ref.type === "time" ? ref.sec : ref.type === "page" ? ref.page : ref.index;
}

/**
 * Index of the item the reader is in: the last item that starts at or before the position.
 * Returns -1 when there is no position yet or it is of another kind.
 */
export function activeIndex(
  items: { locator: Locator; idx: number }[],
  position: ViewerPosition,
): number {
  if (!position) return -1;
  let found = -1;
  items.forEach((item, i) => {
    const ref = locatorRef(item.locator, item.idx);
    if (ref.type === position.type && startOf(ref) <= startOf(position)) found = i;
  });
  return found;
}
