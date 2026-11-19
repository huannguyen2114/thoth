import { z } from "zod";
import { citationToken } from "../../domain/citation";
import type { Chapter } from "../../domain/content";
import { type BoardElement, boardColors, inkColors } from "../../domain/whiteboard";

/**
 * Layout rules for Claude, adapted from how Claude lays out an explanation on a whiteboard
 * (doc 18). Tests check that every prompt carries them.
 */
export const LAYOUT_RULES = `Layout rules (follow all of them):
1. Units are pixels at 100% zoom. x grows to the right, y grows down. Use multiples of 8 for x, y, w and h.
2. One idea per element, in a few words (2 to 8). Never a paragraph: split a long idea into several elements.
3. Read order is left to right, then top to bottom. A process or flow runs left to right on one row; start a new row below only after about 5 steps.
4. No overlaps. Keep a 24-unit gap between elements. Inside a section keep 24 from its sides and leave 48 at its top for the title.
5. Use a section to group related elements. Add the section before the elements inside it.
6. Draw an arrow only where meaning flows (cause, sequence, input to output), never for decoration. Label an arrow only when the relation is not obvious, in 1 to 3 words.
7. Use at most four colours on the board, and use each one for one meaning (for example one colour per stage).
8. A new board starts with a title (a "text" element, size "title") at the top left and a one-line takeaway (a "text" element, size "body") just below it.
9. Sizes: a shape is 160 to 240 wide and 56 to 96 tall (about 8 units per character of a line of body text); a sticky is about 200 by 160 for a longer note; a text element needs no w or h (w sets its wrap width). A table is for comparisons: rows of short cells, row 0 is the header.
10. Cite the material: every element that comes from the source gets "source" set to one citation token copied exactly from the source text, like "[p.3]", "[03:21]" or "[§2]". Your own titles and connecting words get no source.
11. When the board already has content, put new elements in free space beside it (to the right, or below) and align them with what is there. Never place anything on top of an existing element.`;

export const OWNERSHIP_RULES = `Ownership:
- Elements with "by":"person" belong to the person. Never update or remove them unless their id is listed in <may_change>. You may draw arrows to and from them.
- Elements with "by":"claude" are yours: update or remove them when the request needs it.
- Give new elements short new ids (like "s1" or "step-2") and use those ids in later operations of the same reply.`;

export function askSystemPrompt(): string {
  return `You are Thoth's whiteboard assistant. You explain a study source visually: you lay out blocks, sections, arrows, tables and short notes on a canvas so a student understands the material at a glance. You change the board only through operations.

${LAYOUT_RULES}

${OWNERSHIP_RULES}

Operations:
- {"op":"add","id":"<new id>","fields":{"type":..., ...}} adds an element. The words of a shape, sticky or text element go in "text"; a section's heading goes in "title"; an arrow's words go in "label". Types: "shape" (kind: rect, rounded, ellipse, diamond or pill; colors: ${boardColors.join(", ")}), "sticky", "text" (colors: ${inkColors.join(", ")}; sizes: small, body, large, title, huge), "section" (title, color), "arrow" (from, to, optional label; colors: ${inkColors.join(", ")}) and "table" (rows).
- {"op":"update","id":"<id>","fields":{...only the changed fields}} changes an element.
- {"op":"remove","id":"<id>"} removes an element and its arrows.

Reply with "summary": one plain sentence that tells the student what you drew or changed, and "ops": the operations, in order. Use only facts from the source text. If the request cannot be drawn from the source, add nothing and say why in the summary.`;
}

export function mindMapSystemPrompt(): string {
  return `You are Thoth's mind-map assistant. You turn a study source into a concept tree that a student can read at a glance. You do not place anything: the app lays the tree out.

Rules:
1. Return the tree as a flat list of nodes. Each node has an id, the id of its parent (null for the one root), a label and a source.
2. The root is the subject of the source, or the focus the student asked for.
3. Level 1 is the main themes, in the order the source covers them (3 to 7; the chapters when there are chapters). Level 2 is the key ideas of each theme (2 to 5 each). Add a level 3 only where it really helps, and sparingly.
4. A label is 1 to 5 words: a concept, not a sentence. No numbering, no trailing punctuation.
5. Every node gets "source": one citation token copied exactly from the source text, like "[p.3]", "[03:21]" or "[§2]", pointing to where that idea is explained.
6. At most 40 nodes.
7. Also return "title" (2 to 6 words) and "takeaway": one sentence of at most 120 characters that says what the whole map shows.
Use only facts from the source text.`;
}

/** Colours a model may write, for any element type. Core moves each to the right palette. */
const anyColor = z.enum([...new Set<string>([...boardColors, ...inkColors])] as [
  string,
  ...string[],
]);

/**
 * What Claude writes for one element: a flat, JSON-schema-friendly shape (no unions, no
 * regex, no number limits), turned into `boardOpSchema` operations and validated by core.
 */
export const claudeFieldsSchema = z.object({
  type: z.enum(["shape", "sticky", "text", "section", "arrow", "table"]).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  kind: z.enum(["rect", "rounded", "ellipse", "diamond", "pill"]).optional(),
  color: anyColor.optional(),
  size: z.enum(["small", "body", "large", "title", "huge"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  label: z.string().optional(),
  dash: z.boolean().optional(),
  rows: z.array(z.array(z.string())).optional(),
  source: z.string().optional().describe('One citation token, like "[p.3]".'),
});
export type ClaudeFields = z.infer<typeof claudeFieldsSchema>;

export const claudeOpsSchema = z.object({
  summary: z.string(),
  ops: z.array(
    z.object({
      op: z.enum(["add", "update", "remove"]),
      id: z.string(),
      fields: claudeFieldsSchema.optional(),
    }),
  ),
});
export type ClaudeOps = z.infer<typeof claudeOpsSchema>;

export const claudeMindMapSchema = z.object({
  title: z.string(),
  takeaway: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      parent: z.string().nullable(),
      label: z.string(),
      source: z.string().optional(),
    }),
  ),
});
export type ClaudeMindMap = z.infer<typeof claudeMindMapSchema>;

const round = (n: number) => Math.round(n);

/** The board as compact JSON, one element per line, without defaults or long SVG. */
export function compactBoard(elements: readonly BoardElement[]): string {
  if (elements.length === 0) return "(empty board)";
  return elements
    .map((e) => {
      const o: Record<string, unknown> = { id: e.id, type: e.type, by: e.by };
      for (const [k, v] of Object.entries(e)) {
        if (k in o || v === undefined || k === "svg") continue;
        if (k === "source") o.source = (v as { token: string }).token;
        else if (typeof v === "number") o[k] = round(v);
        else o[k] = v;
      }
      return JSON.stringify(o);
    })
    .join("\n");
}

export function chapterList(chapters: readonly Chapter[]): string {
  if (chapters.length === 0) return "";
  return [...chapters]
    .sort((a, b) => a.idx - b.idx)
    .map((c) => `${citationToken(c.locator)} ${c.title}`)
    .join("\n");
}

export function askUserMessage(input: {
  boardTitle: string;
  elements: readonly BoardElement[];
  mayChange: readonly string[];
  request: string;
  chapters: string;
}): string {
  const parts = [
    `<board title="${input.boardTitle.replace(/"/g, "'")}">\n${compactBoard(input.elements)}\n</board>`,
    `<may_change>${input.mayChange.join(", ") || "(none)"}</may_change>`,
  ];
  if (input.chapters) parts.push(`<chapters>\n${input.chapters}\n</chapters>`);
  parts.push(`<request>\n${input.request}\n</request>`);
  return parts.join("\n\n");
}

export function mindMapUserMessage(input: { focus?: string; title: string; chapters: string }) {
  const parts = [`Source: ${input.title}`];
  if (input.chapters) parts.push(`<chapters>\n${input.chapters}\n</chapters>`);
  parts.push(
    input.focus
      ? `Make a mind map focused on: ${input.focus}`
      : "Make a mind map of the whole source.",
  );
  return parts.join("\n\n");
}
