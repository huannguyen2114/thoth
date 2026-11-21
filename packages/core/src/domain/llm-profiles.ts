import { z } from "zod";
import { type LlmTask, llmModels, llmProviderIds, llmTasks } from "./llm-settings";

/**
 * LLM settings v2 (Phase 10, doc 20, ADR-0037): several saved providers ("profiles") and a
 * profile plus model per task, so chat can stay on Claude while flashcards use a local model.
 */
export const llmProfileKinds = llmProviderIds;
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

/** The two Claude profiles every install starts with. They cannot be edited or deleted. */
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

export const isBuiltInProfile = (id: string): boolean => builtInProfiles.some((p) => p.id === id);

// ---- v1 (Phases 1–9): one provider for every task. Kept only to upgrade stored values. ----

const llmSettingsV1Schema = z.object({
  provider: z.enum(["anthropic-api", "claude-subscription"]),
  models: z.object(
    Object.fromEntries(llmTasks.map((t) => [t, z.enum(llmModels)])) as Record<
      LlmTask,
      z.ZodEnum<{ [K in (typeof llmModels)[number]]: K }>
    >,
  ),
});
export type LlmSettingsV1 = z.infer<typeof llmSettingsV1Schema>;

/** v1 → v2: the old single provider becomes every task's profile, keeping each task's model. */
export function upgradeLlmSettings(v1: LlmSettingsV1): LlmSettingsV2 {
  return {
    version: 2,
    profiles: builtInProfiles,
    tasks: Object.fromEntries(
      llmTasks.map((t) => [t, { profileId: v1.provider, model: v1.models[t] }]),
    ) as Record<LlmTask, TaskRoute>,
  };
}

/**
 * Reads a stored settings value of either version. Null when it is neither.
 * Built-in profiles are always present and always current, whatever was stored.
 */
export function readLlmSettings(stored: unknown): LlmSettingsV2 | null {
  const v2 = llmSettingsV2Schema.safeParse(stored);
  if (v2.success) return withBuiltIns(v2.data);
  const v1 = llmSettingsV1Schema.safeParse(stored);
  return v1.success ? upgradeLlmSettings(v1.data) : null;
}

function withBuiltIns(s: LlmSettingsV2): LlmSettingsV2 {
  const custom = s.profiles.filter((p) => !isBuiltInProfile(p.id));
  return { ...s, profiles: [...builtInProfiles, ...custom] };
}

/** What a fresh install uses: the Claude subscription with Opus 5.5 for every task. */
export const defaultLlmSettingsV2: LlmSettingsV2 = upgradeLlmSettings({
  provider: "claude-subscription",
  models: Object.fromEntries(
    llmTasks.map((t) => [t, "claude-opus-5-5"]),
  ) as LlmSettingsV1["models"],
});

// ---- Presets and keys for OpenAI-compatible profiles (doc 20) ----

export const llmPresetIds = ["ollama", "lmstudio", "openrouter", "openai", "custom"] as const;
export type LlmPresetId = (typeof llmPresetIds)[number];

export interface LlmPreset {
  id: LlmPresetId;
  name: string;
  baseUrl: string;
  /** Whether the provider needs an API key. Local servers do not. */
  needsKey: boolean;
  /** A starting model id, so the form is never empty. "Test connection" lists the real ones. */
  model: string;
  help: string;
}

export const llmPresets: Record<LlmPresetId, LlmPreset> = {
  ollama: {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    model: "llama3.2",
    help: "Local models on this computer. Install Ollama, then `ollama pull <model>`.",
  },
  lmstudio: {
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    needsKey: false,
    model: "local-model",
    help: "Local models. Start the server from LM Studio's Developer tab.",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    model: "openai/gpt-5-mini",
    help: "Many hosted models behind one key from openrouter.ai.",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    model: "gpt-5-mini",
    help: "Bills your OpenAI API account.",
  },
  custom: {
    id: "custom",
    name: "Custom",
    baseUrl: "http://localhost:8000/v1",
    needsKey: false,
    model: "model",
    help: "Any server that speaks the OpenAI chat-completions API.",
  },
};

/** Environment variables that override a saved key (ADR-0037). */
export const llmKeyEnvVars = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"] as const;
export type LlmKeyEnvVar = (typeof llmKeyEnvVars)[number];

/** Which environment variable, if any, supplies this profile's key. Env always wins. */
export function envKeyVarFor(profile: Pick<LlmProfile, "kind" | "baseUrl">): LlmKeyEnvVar | null {
  if (profile.kind === "anthropic-api") return "ANTHROPIC_API_KEY";
  if (profile.kind !== "openai-compatible" || !profile.baseUrl) return null;
  let host: string;
  try {
    host = new URL(profile.baseUrl).hostname;
  } catch {
    return null;
  }
  if (host === "api.openai.com") return "OPENAI_API_KEY";
  if (host === "openrouter.ai" || host.endsWith(".openrouter.ai")) return "OPENROUTER_API_KEY";
  return null;
}
