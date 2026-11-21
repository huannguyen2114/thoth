import { z } from "zod";
import {
  defaultLlmSettings,
  type LlmSettings,
  type LlmTask,
  llmModels,
  llmSettingsSchema as llmSettingsV1Schema,
  llmTasks,
} from "./llm-settings";

/**
 * LLM settings v2 (Phase 10, doc 20): several saved providers ("profiles") and a profile plus
 * model per task, so chat can stay on Claude while flashcards use a local Ollama model.
 *
 * Contract frozen in Phase 10 Step 0. Lane 2 moves every reader of `LlmSettings` (v1) to this
 * shape and then deletes v1, keeping `upgradeLlmSettings` so stored v1 values still load.
 */
export const llmProfileKinds = [
  "claude-subscription",
  "anthropic-api",
  "openai-compatible",
] as const;
export type LlmProfileKind = (typeof llmProfileKinds)[number];

export const llmProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  kind: z.enum(llmProfileKinds),
  name: z.string().trim().min(1).max(60),
  /** openai-compatible only, e.g. "http://localhost:11434/v1". */
  baseUrl: z.url().nullable().default(null),
  /**
   * Name of the secret in the OS keychain (SecretStore). Null when the profile needs no key
   * (subscription, local Ollama) or reads it from the environment.
   */
  keyRef: z.string().max(80).nullable().default(null),
  /** Model ids the owner can pick for this profile. Free-form for openai-compatible. */
  models: z.array(z.string().min(1).max(200)).min(1),
  /** Found by "Test connection". */
  caps: z
    .object({ jsonSchema: z.boolean(), tools: z.boolean() })
    .default({ jsonSchema: false, tools: false }),
});
export type LlmProfile = z.infer<typeof llmProfileSchema>;

export const taskRouteSchema = z.object({ profileId: z.string(), model: z.string().min(1) });
export type TaskRoute = z.infer<typeof taskRouteSchema>;

export const llmSettingsV2Schema = z
  .object({
    version: z.literal(2),
    profiles: z.array(llmProfileSchema).min(1),
    tasks: z.object(
      Object.fromEntries(llmTasks.map((t) => [t, taskRouteSchema])) as Record<
        LlmTask,
        typeof taskRouteSchema
      >,
    ),
  })
  .superRefine((s, ctx) => {
    const ids = new Set(s.profiles.map((p) => p.id));
    if (ids.size !== s.profiles.length)
      ctx.addIssue({ code: "custom", message: "Profile ids must be unique." });
    for (const t of llmTasks) {
      if (!ids.has(s.tasks[t].profileId)) {
        ctx.addIssue({ code: "custom", path: ["tasks", t], message: "Pick a saved provider." });
      }
    }
  });
export type LlmSettingsV2 = z.infer<typeof llmSettingsV2Schema>;

/** The two Claude profiles every install starts with. */
export const builtInProfiles: LlmProfile[] = [
  {
    id: "claude-subscription",
    kind: "claude-subscription",
    name: "Claude subscription (Claude Code)",
    baseUrl: null,
    keyRef: null,
    models: [...llmModels],
    caps: { jsonSchema: true, tools: true },
  },
  {
    id: "anthropic-api",
    kind: "anthropic-api",
    name: "Anthropic API key",
    baseUrl: null,
    keyRef: "anthropic-api",
    models: [...llmModels],
    caps: { jsonSchema: true, tools: true },
  },
];

/** v1 → v2: the old single provider becomes every task's profile, keeping each task's model. */
export function upgradeLlmSettings(v1: LlmSettings): LlmSettingsV2 {
  return {
    version: 2,
    profiles: builtInProfiles,
    tasks: Object.fromEntries(
      llmTasks.map((t) => [t, { profileId: v1.provider, model: v1.models[t] }]),
    ) as Record<LlmTask, TaskRoute>,
  };
}

/** Reads a stored settings value of either version. Null when it is neither. */
export function readLlmSettings(stored: unknown): LlmSettingsV2 | null {
  const v2 = llmSettingsV2Schema.safeParse(stored);
  if (v2.success) return v2.data;
  const v1 = llmSettingsV1Schema.safeParse(stored);
  return v1.success ? upgradeLlmSettings(v1.data) : null;
}
/** What a fresh install uses: the Claude subscription for every task. */
export const defaultLlmSettingsV2: LlmSettingsV2 = upgradeLlmSettings(defaultLlmSettings);
