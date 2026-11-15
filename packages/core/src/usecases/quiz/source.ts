import { type CitationRef, citationToken, parseCitations } from "../../domain/citation";
import type { Chapter, Locator, Segment } from "../../domain/content";

/** Max characters of source text sent for one topic. Keeps one request well inside the context window. */
export const MAX_SOURCE_CHARS = 60_000;

const startOf = (l: Locator): number =>
  l.type === "page" ? l.page : l.type === "time" ? l.startSec : l.start;

/**
 * The segments that belong to one chapter. A chapter owns everything from its own start to the
 * start of the next chapter (the last chapter runs to the end). Chapters must be sorted by idx.
 */
export function segmentsForChapter(
  chapter: Chapter,
  chapters: readonly Chapter[],
  segments: readonly Segment[],
): Segment[] {
  const next = chapters.find((c) => c.idx > chapter.idx);
  const from = startOf(chapter.locator);
  const to = next ? startOf(next.locator) : Number.POSITIVE_INFINITY;
  const inRange = segments.filter((s) => {
    if (s.locator.type !== chapter.locator.type) return false;
    // A segment belongs to the chapter that contains its start.
    const at = startOf(s.locator);
    return at >= from && at < to;
  });
  return inRange.sort((a, b) => a.idx - b.idx);
}

/** `[p.3] text` / `[03:21] text` / `[§4] text` lines, so the model can cite what it used. */
export function renderSourceText(
  segments: readonly Segment[],
  maxChars = MAX_SOURCE_CHARS,
): string {
  const lines: string[] = [];
  let used = 0;
  for (const s of segments) {
    const line = `${citationToken(s.locator, s.idx)} ${s.text.trim()}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

/** Turns a citation token the model wrote (for example "[p.3]") into a Locator of a real segment. */
export function resolveCitation(
  token: string | null | undefined,
  segments: readonly Segment[],
): Locator | null {
  if (!token) return null;
  const ref: CitationRef | undefined = parseCitations(token)[0]?.ref;
  if (!ref) return null;
  if (ref.type === "page") {
    return (
      segments.find((s) => s.locator.type === "page" && s.locator.page === ref.page)?.locator ??
      null
    );
  }
  if (ref.type === "paragraph") return segments.find((s) => s.idx === ref.index)?.locator ?? null;
  // Time: the last segment starting at or before the cited second.
  const timed = segments
    .filter((s) => s.locator.type === "time" && s.locator.startSec <= ref.sec)
    .sort((a, b) => startOf(b.locator) - startOf(a.locator));
  return timed[0]?.locator ?? null;
}
