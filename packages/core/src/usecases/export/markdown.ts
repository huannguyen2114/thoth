/** A filesystem-safe file name stem: "Intro to Biology!" -> "intro-to-biology". */
export function slugify(text: string, fallback = "export"): string {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || fallback;
}

export interface MarkdownExportInput {
  title: string;
  sourceUrl: string | null;
  notes: string | null;
  summaries: { title: string; body: string }[];
}

/** Notes and summaries of one content as a single Markdown document. */
export function contentToMarkdown(input: MarkdownExportInput): string {
  const parts = [`# ${input.title}`];
  if (input.sourceUrl) parts.push(`Source: ${input.sourceUrl}`);
  if (input.notes?.trim()) parts.push("## Notes", input.notes.trim());
  for (const s of input.summaries) parts.push(`## Summary: ${s.title}`, s.body.trim());
  return `${parts.join("\n\n")}\n`;
}
