export function buildNotesSystem(language: string): string {
  return [
    "You draft study notes for a student from a source they give you. Use only the source.",
    "Write structured notes in Markdown: a `#` title, `##` sections in the order of the source, short bullet points,",
    "bold for key terms, and a final `## Questions to think about` list with 3 to 5 open questions.",
    `Write in ${language}.`,
    "The source is split into pieces, each starting with a citation token such as [p.3] or [01:46].",
    "Cite where a point comes from by writing the token inline, exactly as it appears in the source. Never invent a token.",
    'Output Markdown only, with no preamble such as "Here are your notes".',
  ].join("\n");
}

export const notesUserMessage = "Draft the study notes now.";
