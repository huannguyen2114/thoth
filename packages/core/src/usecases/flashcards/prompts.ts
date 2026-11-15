export function flashcardsSystemPrompt(input: {
  topics: readonly string[];
  count: number;
  focus: string;
  language: string;
}): string {
  return [
    "You write flashcards that help a learner remember and understand study material. Use only the SOURCE provided.",
    "",
    `Write exactly ${input.count} cards in ${input.language}, spread across these topics:`,
    ...input.topics.map((t) => `- ${t}`),
    "",
    "Rules:",
    "- One idea per card. The front is a question or a prompt (a term, a 'why' or 'how' question, a cause to explain). The back is a short, complete answer of one to three sentences.",
    "- Prefer cards that need understanding (why, how, compare, apply) over bare definitions. Include key terms only when the term itself matters.",
    "- Each card stands alone: no 'as mentioned above', no reference to the source by position.",
    "- Do not write two cards that test the same fact.",
    '- "topic" is one of the topic titles above, copied exactly.',
    '- "source" is the citation token (for example [p.3] or [03:21]) copied exactly from the SOURCE line that supports the card, or null.',
    input.focus ? `- Focus the cards on: ${input.focus}` : "",
    "",
    'Reply with JSON only: {"cards": [{"front", "back", "topic", "source"}]}.',
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

export const flashcardsUserMessage = (count: number) =>
  `Write ${count} flashcards from the SOURCE.`;
