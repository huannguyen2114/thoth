import type { Locator } from "./content";

/**
 * Citation tokens the model writes inline: [p.12] for pages, [03:21] or [1:02:03] for times,
 * [§4] for paragraph offsets. The UI turns them into chips that jump the viewer.
 */
export type CitationRef =
  | { type: "page"; page: number }
  | { type: "time"; sec: number }
  | { type: "paragraph"; index: number };

export interface CitationMatch {
  ref: CitationRef;
  /** The raw token including brackets, e.g. "[p.12]". */
  raw: string;
  start: number;
  end: number;
}

const TOKEN = /\[(?:p\.(\d+)|(\d{1,2}(?::\d{2}){1,2})|§(\d+))\]/g;

export function parseCitations(text: string): CitationMatch[] {
  const out: CitationMatch[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    const raw = m[0];
    let ref: CitationRef | null = null;
    if (m[1]) ref = { type: "page", page: Number(m[1]) };
    else if (m[2]) ref = { type: "time", sec: parseClock(m[2]) };
    else if (m[3]) ref = { type: "paragraph", index: Number(m[3]) };
    if (ref) out.push({ ref, raw, start, end: start + raw.length });
  }
  return out;
}

/** "03:21" -> 201, "1:02:03" -> 3723 */
export function parseClock(clock: string): number {
  return clock.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** 201 -> "03:21", 3723 -> "1:02:03" */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * The citation token for a locator. Paragraph tokens are 1-based everywhere (prompts, viewer,
 * stored locators): `[§1]` is the first paragraph (ADR-0019). For an offset locator the number
 * comes from `locator.paragraph`; `paragraph` is only a fallback for locators without one.
 */
export function citationToken(locator: Locator, paragraph?: number): string {
  switch (locator.type) {
    case "page":
      return `[p.${locator.page}]`;
    case "time":
      return `[${formatClock(locator.startSec)}]`;
    case "offset":
      return `[§${locator.paragraph ?? paragraph ?? 1}]`;
  }
}

/** The 1-based paragraph number of a segment: its stored number, else its position + 1. */
export const paragraphOf = (segment: { idx: number; locator: Locator }): number =>
  segment.locator.type === "offset"
    ? (segment.locator.paragraph ?? segment.idx + 1)
    : segment.idx + 1;
