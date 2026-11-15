import { z } from "zod";
import { parseClock } from "../../domain/citation";
import type { Locator, Segment } from "../../domain/content";

/** A part of the source to summarise. Time ranges apply to time locators, page ranges to page locators. */
export const summaryRangeSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("time"),
      startSec: z.number().min(0),
      endSec: z.number().min(0),
    })
    .refine((r) => r.endSec > r.startSec, { message: "A time range must end after it starts." }),
  z
    .object({
      type: z.literal("page"),
      startPage: z.number().int().min(1),
      endPage: z.number().int().min(1),
    })
    .refine((r) => r.endPage >= r.startPage, {
      message: "A page range must end on or after its first page.",
    }),
]);
export type SummaryRange = z.infer<typeof summaryRangeSchema>;

function inRange(locator: Locator, range: SummaryRange): boolean {
  if (range.type === "time" && locator.type === "time") {
    // Overlap, so a segment that straddles the boundary still counts.
    return locator.startSec < range.endSec && locator.endSec > range.startSec;
  }
  if (range.type === "page" && locator.type === "page") {
    return locator.page >= range.startPage && locator.page <= range.endPage;
  }
  return false;
}

/**
 * Segments inside any of the ranges, in reading order. No ranges means the whole source.
 * A range of one type never matches a locator of another type (a page range on a video is ignored).
 */
export function selectSegments(segments: Segment[], ranges: SummaryRange[]): Segment[] {
  const ordered = [...segments].sort((a, b) => a.idx - b.idx);
  if (ranges.length === 0) return ordered;
  return ordered.filter((s) => ranges.some((r) => inRange(s.locator, r)));
}

/** Human label for a range, e.g. "01:46–28:22" or "pages 3–5". */
export function describeRange(range: SummaryRange, formatClock: (sec: number) => string): string {
  if (range.type === "time") return `${formatClock(range.startSec)}–${formatClock(range.endSec)}`;
  return range.startPage === range.endPage
    ? `page ${range.startPage}`
    : `pages ${range.startPage}–${range.endPage}`;
}

/** What kind of ranges a source supports, and how big it is. Drives the dialog's inputs. */
export interface SourceBounds {
  locatorType: "time" | "page" | "offset" | null;
  durationSec: number | null;
  pageCount: number | null;
}

export function sourceBounds(segments: Segment[]): SourceBounds {
  const first = segments[0]?.locator.type ?? null;
  let durationSec = 0;
  let pageCount = 0;
  for (const s of segments) {
    if (s.locator.type === "time") durationSec = Math.max(durationSec, s.locator.endSec);
    if (s.locator.type === "page") pageCount = Math.max(pageCount, s.locator.page);
  }
  return {
    locatorType: first,
    durationSec: first === "time" ? durationSec : null,
    pageCount: first === "page" ? pageCount : null,
  };
}

/** Accepts "106", "1:46", "01:46" or "1:02:03" and returns seconds, or null if it is not a time. */
export function parseTimeInput(text: string): number | null {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d{1,2}(:\d{2}){1,2}$/.test(t)) return parseClock(t);
  return null;
}
