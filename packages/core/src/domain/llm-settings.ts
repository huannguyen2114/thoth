import { z } from "zod";

/** Tasks that call a model. Each can use its own model. See ADR-0013. */
export const llmTasks = ["chat", "chapters", "summary", "quiz", "flashcards", "grading"] as const;
export type LlmTask = (typeof llmTasks)[number];

export const llmProviderIds = ["anthropic-api", "claude-subscription"] as const;
export type LlmProviderId = (typeof llmProviderIds)[number];

export const llmModels = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type LlmModel = (typeof llmModels)[number];

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

export const llmSettingsSchema = z.object({
  provider: z.enum(llmProviderIds),
  models: z.object(
    Object.fromEntries(llmTasks.map((t) => [t, z.enum(llmModels)])) as Record<
      LlmTask,
      z.ZodEnum<{ [K in LlmModel]: K }>
    >,
  ),
});
export type LlmSettings = z.infer<typeof llmSettingsSchema>;

export const defaultLlmSettings: LlmSettings = {
  provider: "claude-subscription",
  models: Object.fromEntries(llmTasks.map((t) => [t, "claude-opus-5-5"])) as Record<
    LlmTask,
    LlmModel
  >,
};

export const llmProviderLabels: Record<LlmProviderId, string> = {
  "anthropic-api": "Anthropic API key",
  "claude-subscription": "Claude subscription (Claude Code)",
};
