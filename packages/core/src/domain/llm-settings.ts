/**
 * Shared LLM vocabulary: tasks, provider kinds, Claude model ids and effort levels.
 * The settings shape itself (profiles plus a route per task) is in `llm-profiles.ts` (doc 20).
 */

/** Tasks that call a model. Each can use its own provider and model. See ADR-0013, ADR-0037. */
export const llmTasks = ["chat", "chapters", "summary", "quiz", "flashcards", "grading"] as const;
export type LlmTask = (typeof llmTasks)[number];

/** Adapter kinds. A profile has one kind; several profiles may share "openai-compatible". */
export const llmProviderIds = [
  "claude-subscription",
  "anthropic-api",
  "openai-compatible",
] as const;
export type LlmProviderId = (typeof llmProviderIds)[number];

/** Claude models offered on the two built-in Claude profiles. */
export const llmModels = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type LlmModel = (typeof llmModels)[number];

export const llmModelLabels: Record<LlmModel, string> = {
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
};

export const llmEfforts = ["low", "medium", "high", "xhigh", "max"] as const;
export type LlmEffort = (typeof llmEfforts)[number];

/** Default effort per task, sent explicitly on every request (ADR-0013). */
export const defaultEffortByTask: Record<LlmTask, LlmEffort> = {
  chat: "medium",
  chapters: "low",
  summary: "medium",
  quiz: "high",
  flashcards: "medium",
  grading: "medium",
};
