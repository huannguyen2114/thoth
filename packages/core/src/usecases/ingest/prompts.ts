import { z } from "zod";
import type { Locator, Segment } from "../../domain/content";

/**
 * Prompt and output schema for the `chapters` task.
 * The model sees numbered segments and picks where each chapter starts, so every chapter's
 * locator is computed from real segments instead of being invented by the model.
 */

export const chaptersOutputSchema = z.object({
  chapters: z
    .array(
      z.object({
        startSegment: z
          .number()
          .int()
          .min(0)
          .describe("The [number] of the segment where this chapter starts."),
        title: z.string().min(1).describe("Short chapter title in sentence case, 3 to 8 words."),
        summary: z
          .string()
          .min(1)
          .describe("One or two plain sentences on what this chapter covers."),
      }),
    )
    .min(1),
});
export type ChaptersOutput = z.infer<typeof chaptersOutputSchema>;

export const CHAPTERS_SYSTEM = `You divide study material into chapters for a student.

Rules:
- Each chapter covers one coherent topic, in source order, with no gaps.
- A chapter starts at a segment number shown in square brackets, like [12].
- The first chapter starts at the first segment you are given.
- Titles are short and specific, in sentence case, with no numbering and no trailing period.
- Summaries are one or two plain sentences that say what the chapter teaches.
- Write titles and summaries in the language of the source.
- Use only the source. Do not add facts.`;

export function locatorLabel(locator: Locator): string {
  switch (locator.type) {
    case "page":
      return `p.${locator.page}`;
    case "time":
      return formatTime(locator.startSec);
    case "offset":
      return `§`;
  }
}

export function formatTime(totalSec: number): string {
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${sec}`
    : `${String(m).padStart(2, "0")}:${sec}`;
}

/** Source text for the model: one line block per segment, prefixed by its number. */
export function renderSegments(segments: Segment[]): string {
  return segments.map((s) => `[${s.idx}] (${locatorLabel(s.locator)}) ${s.text}`).join("\n\n");
}

export interface ChapterWindow {
  title: string;
  part: number;
  parts: number;
  firstIdx: number;
  lastIdx: number;
  targetChapters: number;
}

export function chaptersUserPrompt(w: ChapterWindow): string {
  const scope =
    w.parts > 1
      ? `This is part ${w.part} of ${w.parts} of the source, segments [${w.firstIdx}] to [${w.lastIdx}]. Chapter only this part.`
      : `The source has segments [${w.firstIdx}] to [${w.lastIdx}].`;
  return `Source title: ${w.title}
${scope}
Write about ${w.targetChapters} chapter${w.targetChapters === 1 ? "" : "s"} (fewer if the material is short or covers one topic). The first chapter starts at [${w.firstIdx}].`;
}
