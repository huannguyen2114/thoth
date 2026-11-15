import type { ContentKind } from "../../domain/content";
import type { ChatContextMode } from "./context";

/** How each kind of source is cited. Mirrors parseCitations in domain/citation.ts. */
const citationRule: Record<ContentKind, string> = {
  youtube:
    "Cite times as [mm:ss] or [h:mm:ss], copying the token that starts the supporting passage, for example [03:21].",
  pdf: "Cite pages as [p.N], copying the token of the supporting page, for example [p.5].",
  webpage:
    "Cite paragraphs as [§N], copying the token of the supporting paragraph, for example [§4].",
  text: "Cite paragraphs as [§N], copying the token of the supporting paragraph, for example [§4].",
};

export interface ChatSystemPromptInput {
  kind: ContentKind;
  title: string;
  mode: ChatContextMode;
  /** The owner's custom chat instructions, if any. */
  instructions: string | null;
}

/**
 * System prompt for chat. The source itself goes in LlmRequest.context, so this stays small
 * and stable. Citation tokens must be exactly what parseCitations understands.
 */
export function buildChatSystemPrompt(input: ChatSystemPromptInput): string {
  const rules = [
    `You are Thoth, a calm and precise study companion. The learner is studying "${input.title}". The source is in the <source> block: each passage starts with its citation token.`,
    "",
    "Rules:",
    "- Answer from the source. Put a citation token right after every sentence or bullet that uses it.",
    `- ${citationRule[input.kind]}`,
    "- Only use tokens that appear in the source. Never invent, round or merge tokens. Cite several passages as separate tokens, like [p.2] [p.3].",
    "- If the source does not cover the question, say so in one sentence, then answer briefly from general knowledge and mark that part as not from the source. Do not cite it.",
    "- Be concise. Use short paragraphs, and use a bulleted list ('- ') only for steps or several parallel items. Use **bold** sparingly for key terms. No headings, tables or emoji.",
    "- Answer in the language of the learner's question.",
  ];
  if (input.mode === "search") {
    rules.push(
      "- The source block holds only the passages that best match the question, not the whole source. If they are not enough, say what is missing.",
    );
  }
  const custom = input.instructions?.trim();
  if (custom) {
    rules.push(
      "",
      "The learner's own chat instructions follow. Apply them unless they conflict with the citation rules above.",
      "<chat_instructions>",
      custom,
      "</chat_instructions>",
    );
  }
  return rules.join("\n");
}

/** A short chat title from the first question: first line, at most 60 characters. */
export function chatTitleFrom(question: string): string {
  const line = question.trim().split("\n")[0]?.replace(/\s+/g, " ") ?? "";
  if (line.length <= 60) return line || "New chat";
  const cut = line.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
