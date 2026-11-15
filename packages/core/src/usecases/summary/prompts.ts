import { citationToken } from "../../domain/citation";
import type { Segment } from "../../domain/content";

export const summaryTemplates = ["detailed", "cheat_sheet", "short"] as const;
export type SummaryTemplate = (typeof summaryTemplates)[number];

export const summaryTemplateLabels: Record<SummaryTemplate, string> = {
  detailed: "Detailed",
  cheat_sheet: "Cheat sheet",
  short: "Short",
};

const templateInstructions: Record<SummaryTemplate, string> = {
  detailed: [
    "Write a comprehensive study summary.",
    "Start with a one-paragraph overview, then use `##` headings for each major topic.",
    "Under each heading explain the ideas fully: definitions, reasoning, examples and any numbers or names that matter.",
    "End with a `## Key takeaways` list.",
  ].join(" "),
  cheat_sheet: [
    "Write a concise cheat sheet for quick revision.",
    "Use `##` headings and short bullet points only. No long paragraphs.",
    "Put definitions, formulas, names and numbers in bold. Keep it to what someone would write on one page.",
  ].join(" "),
  short: [
    "Write the essentials only: a title line, then at most 5 bullet points,",
    "then one sentence that states the single most important idea. No headings beyond the title.",
  ].join(" "),
};

export interface SummaryPromptOptions {
  template: SummaryTemplate;
  language: string;
  customPrompt?: string | undefined;
}

export function buildSummarySystem(options: SummaryPromptOptions): string {
  const lines = [
    "You write study summaries from a source the student gives you. Use only the source; never add facts that are not in it.",
    templateInstructions[options.template],
    `Write in ${options.language}.`,
    'Output Markdown only, with no preamble such as "Here is the summary".',
    "The source is split into pieces, each starting with a citation token such as [p.3] or [01:46].",
    "Cite the piece a claim comes from by writing its token inline, right after the claim, exactly as it appears in the source (for example [p.3] or [01:46]).",
    "Never invent a token that is not in the source, and never put a token inside a heading.",
  ];
  const custom = options.customPrompt?.trim();
  if (custom) {
    lines.push(
      `The student also asked: "${custom}". Follow it where it does not conflict with the rules above.`,
    );
  }
  return lines.join("\n");
}

/** The source text sent as cached context: each segment prefixed with its citation token. */
export function buildSourceContext(segments: Segment[]): string {
  return segments.map((s) => `${citationToken(s.locator, s.idx)} ${s.text.trim()}`).join("\n\n");
}

export const summaryUserMessage = "Write the summary of the source now.";
