import { defaultLlmSettings, type LlmSettings, llmSettingsSchema } from "../domain/llm-settings";
import type { LlmProvider } from "../ports/llm";
import type { SettingsRepository } from "../ports/repositories";
import { appError, err, ok, type Result } from "../shared/result";

export interface SettingsDeps {
  settings: SettingsRepository;
}

export async function getLlmSettings(deps: SettingsDeps): Promise<LlmSettings> {
  return (await deps.settings.getLlmSettings()) ?? defaultLlmSettings;
}

export async function updateLlmSettings(
  deps: SettingsDeps,
  input: unknown,
): Promise<Result<LlmSettings>> {
  const parsed = llmSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", "Choose a provider and a model for every task."));
  }
  await deps.settings.saveLlmSettings(parsed.data);
  return ok(parsed.data);
}

export interface ConnectionCheck {
  provider: LlmProvider["id"];
  reply: string;
  elapsedMs: number;
}

/** Sends a tiny prompt to prove the provider works end to end. */
export async function checkLlmConnection(
  llm: LlmProvider,
  now: () => number = Date.now,
): Promise<Result<ConnectionCheck>> {
  const started = now();
  const r = await llm.generateText({
    task: "chat",
    effort: "low",
    system: "You are a connection check. Reply with one short sentence.",
    messages: [{ role: "user", content: "Say hello to the Thoth study app in under 12 words." }],
    maxTokens: 256,
  });
  if (!r.ok) return r;
  return ok({ provider: llm.id, reply: r.value.trim(), elapsedMs: now() - started });
}
