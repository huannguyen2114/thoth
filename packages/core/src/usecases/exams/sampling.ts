import type { Chapter, Segment } from "../../domain/content";
import { MAX_SOURCE_CHARS, segmentsForChapter } from "../quiz/source";

/**
 * Picks segments spread evenly across a content's chapters, so a long source is not
 * represented only by its first pages (ADR-0018). Each chapter gets an equal share of
 * `maxChars`; without chapters, segments are taken at an even stride.
 */
export function sampleAcrossChapters(
  chapters: readonly Chapter[],
  segments: readonly Segment[],
  maxChars = MAX_SOURCE_CHARS,
): Segment[] {
  const total = segments.reduce((n, s) => n + s.text.length, 0);
  if (total <= maxChars) return [...segments].sort((a, b) => a.idx - b.idx);

  const sorted = [...chapters].sort((a, b) => a.idx - b.idx);
  const groups =
    sorted.length > 0
      ? sorted.map((c) => segmentsForChapter(c, sorted, segments))
      : [[...segments].sort((a, b) => a.idx - b.idx)];
  const share = Math.floor(maxChars / Math.max(1, groups.length));

  const picked: Segment[] = [];
  for (const group of groups) {
    const groupChars = group.reduce((n, s) => n + s.text.length, 0);
    // Take every k-th segment so the share covers the whole chapter, not just its start.
    const stride = Math.max(1, Math.ceil(groupChars / Math.max(1, share)));
    let used = 0;
    for (let i = 0; i < group.length; i += stride) {
      const s = group[i];
      if (!s || used + s.text.length > share) continue;
      picked.push(s);
      used += s.text.length;
    }
  }
  return picked.sort((a, b) => a.idx - b.idx);
}

/** Splits `count` questions across sources in proportion to their size, at least 1 each. */
export function allocateQuestions(sizes: readonly number[], count: number): number[] {
  if (sizes.length === 0) return [];
  const n = Math.max(count, sizes.length);
  const total = sizes.reduce((a, b) => a + Math.max(1, b), 0);
  const raw = sizes.map((s) => (Math.max(1, s) / total) * n);
  const out = raw.map((r) => Math.max(1, Math.floor(r)));
  // Hand out what rounding lost, largest remainder first.
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) {
    const slot = order[k];
    if (slot) out[slot.i] = (out[slot.i] ?? 0) + 1;
  }
  // If the minimum of 1 each overshot, take back from the largest.
  while (out.reduce((a, b) => a + b, 0) > n) {
    const max = out.indexOf(Math.max(...out));
    out[max] = (out[max] ?? 1) - 1;
  }
  return out;
}

/** The chapter whose range contains a locator (same rule as segmentsForChapter). */
export function chapterAt(
  chapters: readonly Chapter[],
  segment: Segment | undefined,
): Chapter | undefined {
  if (!segment) return undefined;
  const sorted = [...chapters].sort((a, b) => a.idx - b.idx);
  return sorted.find((c) =>
    segmentsForChapter(c, sorted, [segment]).some((s) => s.id === segment.id),
  );
}
