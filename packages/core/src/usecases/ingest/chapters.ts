import type { Locator, NewChapter, Segment } from "../../domain/content";
import type { LlmProvider } from "../../ports/llm";
import { type AppError, ok, type Result } from "../../shared/result";
import {
  CHAPTERS_SYSTEM,
  type ChaptersOutput,
  chaptersOutputSchema,
  chaptersUserPrompt,
  renderSegments,
} from "./prompts";

/**
 * Long sources are split into windows of about this many characters (~25k tokens), and each
 * window gets its own `chapters` call. Small enough for fast, cheap low-effort calls, large
 * enough that a one-hour lecture (~60k characters) is one call.
 */
export const CHAPTER_WINDOW_CHARS = 100_000;
/** Roughly one chapter per this many characters, clamped to 1..12 per window. */
const CHARS_PER_CHAPTER = 6_000;
const MAX_TITLE = 120;
const MAX_SUMMARY = 600;

export function splitIntoWindows(segments: Segment[], maxChars = CHAPTER_WINDOW_CHARS) {
  const windows: Segment[][] = [];
  let current: Segment[] = [];
  let size = 0;
  for (const s of segments) {
    if (current.length > 0 && size + s.text.length > maxChars) {
      windows.push(current);
      current = [];
      size = 0;
    }
    current.push(s);
    size += s.text.length;
  }
  if (current.length > 0) windows.push(current);
  return windows;
}

/** Writes chapters for the whole source, one LLM call per window, in order. */
export async function generateChapters(
  llm: LlmProvider,
  title: string,
  segments: Segment[],
  signal?: AbortSignal,
): Promise<Result<NewChapter[], AppError>> {
  const sorted = [...segments].sort((a, b) => a.idx - b.idx);
  const windows = splitIntoWindows(sorted);
  const chapters: NewChapter[] = [];

  for (const [i, window] of windows.entries()) {
    const first = window[0] as Segment;
    const last = window.at(-1) as Segment;
    const chars = window.reduce((n, s) => n + s.text.length, 0);
    const r = await llm.generateObject(
      {
        task: "chapters",
        system: CHAPTERS_SYSTEM,
        context: renderSegments(window),
        messages: [
          {
            role: "user",
            content: chaptersUserPrompt({
              title,
              part: i + 1,
              parts: windows.length,
              firstIdx: first.idx,
              lastIdx: last.idx,
              targetChapters: Math.min(12, Math.max(1, Math.round(chars / CHARS_PER_CHAPTER))),
            }),
          },
        ],
        maxTokens: 4_000,
        ...(signal ? { signal } : {}),
      },
      chaptersOutputSchema,
    );
    if (!r.ok) return r;
    for (const c of toChapters(r.value, window)) chapters.push({ ...c, idx: chapters.length });
  }
  return ok(chapters);
}

/**
 * Turns the model's chapter starts into chapters with real locators.
 * Out-of-range and duplicate starts are dropped, the first chapter is moved to the window's
 * first segment, and each chapter spans up to the segment before the next chapter.
 */
export function toChapters(output: ChaptersOutput, window: Segment[]): NewChapter[] {
  const byIdx = new Map(window.map((s, pos) => [s.idx, pos]));
  const picked = output.chapters
    .filter((c) => byIdx.has(c.startSegment))
    .sort((a, b) => a.startSegment - b.startSegment)
    .filter((c, i, all) => i === 0 || c.startSegment !== all[i - 1]?.startSegment);
  const firstPicked = picked[0];
  if (!firstPicked) {
    // The model named no valid segment: keep its first chapter, covering the whole window.
    const only = output.chapters[0];
    return only ? [chapterFor(only, window)] : [];
  }

  const starts = picked.map((c) => byIdx.get(c.startSegment) as number);
  starts[0] = 0;
  return picked.map((c, i) =>
    chapterFor(c, window.slice(starts[i], starts[i + 1] ?? window.length)),
  );
}

function chapterFor(c: ChaptersOutput["chapters"][number], span: Segment[]): NewChapter {
  return {
    idx: 0,
    title: clip(c.title.replace(/\.$/, ""), MAX_TITLE),
    summary: clip(c.summary, MAX_SUMMARY),
    locator: spanLocator(span),
  };
}

const clip = (s: string, max: number) => {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

/** The locator that covers a run of segments: first page, a time range, or a char range. */
export function spanLocator(span: Segment[]): Locator {
  const first = (span[0] as Segment).locator;
  const last = (span.at(-1) as Segment).locator;
  if (first.type === "time" && last.type === "time") {
    return { type: "time", startSec: first.startSec, endSec: last.endSec };
  }
  if (first.type === "offset" && last.type === "offset") {
    return { type: "offset", start: first.start, end: last.end };
  }
  return first;
}
