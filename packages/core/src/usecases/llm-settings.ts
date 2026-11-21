import { z } from "zod";
import {
  builtInProfiles,
  defaultLlmSettingsV2,
  envKeyVarFor,
  isBuiltInProfile,
  type LlmKeyEnvVar,
  type LlmProfile,
  type LlmSettingsV2,
  llmSettingsV2Schema,
  readLlmSettings,
  type TaskRoute,
} from "../domain/llm-profiles";
import { type LlmTask, llmTasks } from "../domain/llm-settings";
import type { LlmProvider } from "../ports/llm";
import type { SettingsRepository } from "../ports/repositories";
import type { SecretStore } from "../ports/secrets";
import { appError, err, ok, type Result } from "../shared/result";

/** LLM settings v2: profiles, keys and per-task routes (doc 20, ADR-0037). */
export interface SettingsDeps {
  settings: SettingsRepository;
}

export interface SecretDeps extends SettingsDeps {
  secrets: SecretStore;
}

export async function getLlmSettings(deps: SettingsDeps): Promise<LlmSettingsV2> {
  const stored = await deps.settings.getLlmSettings();
  // The repository already upgrades v1; readLlmSettings also refreshes the built-ins.
  return (stored && readLlmSettings(stored)) ?? defaultLlmSettingsV2;
}

/** Replaces the whole settings value. Rejects routes to unknown profiles or models. */
export async function updateLlmSettings(
  deps: SettingsDeps,
  input: unknown,
): Promise<Result<LlmSettingsV2>> {
  const parsed = llmSettingsV2Schema.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", "Choose a provider and a model for every task."));
  }
  const bad = badRoute(parsed.data);
  if (bad) return err(bad);
  const value = readLlmSettings(parsed.data) ?? parsed.data;
  await deps.settings.saveLlmSettings(value);
  return ok(value);
}

const routeInputSchema = z.object({
  profileId: z.string().min(1),
  model: z.string().trim().min(1),
});
const routesSchema = z.object(
  Object.fromEntries(llmTasks.map((t) => [t, routeInputSchema])) as Record<
    LlmTask,
    typeof routeInputSchema
  >,
);

/** Saves the routing table: a profile and one of its models for every task. */
export async function updateLlmRoutes(
  deps: SettingsDeps,
  input: unknown,
): Promise<Result<LlmSettingsV2>> {
  const parsed = routesSchema.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", "Choose a provider and a model for every task."));
  }
  const current = await getLlmSettings(deps);
  return updateLlmSettings(deps, { ...current, tasks: parsed.data });
}

function badRoute(s: LlmSettingsV2) {
  for (const t of llmTasks) {
    const route = s.tasks[t];
    const profile = s.profiles.find((p) => p.id === route.profileId);
    if (profile && !profile.models.includes(route.model)) {
      return appError(
        "validation",
        `${profile.name} has no model "${route.model}". Add it to the provider or pick another.`,
      );
    }
  }
  return null;
}

const profileInputSchema = z.object({
  /** Omit to add a new profile. */
  id: z.string().optional(),
  name: z.string().trim().min(1, "Give the provider a name.").max(60),
  baseUrl: z.url("Enter a full base URL, such as http://localhost:11434/v1."),
  models: z
    .array(z.string().trim().min(1).max(200))
    .transform((m) => [...new Set(m)])
    .pipe(z.array(z.string()).min(1, "Add at least one model id.")),
  caps: z.object({ jsonSchema: z.boolean(), tools: z.boolean() }).optional(),
});
export type LlmProfileInput = z.input<typeof profileInputSchema>;

/**
 * Adds or edits an OpenAI-compatible profile. Built-in Claude profiles are fixed.
 * A task routed to a model the edit removed moves to the profile's first model.
 */
export async function saveLlmProfile(
  deps: SettingsDeps,
  input: unknown,
): Promise<Result<LlmProfile>> {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Check the fields."));
  }
  const { id, name, baseUrl, models, caps } = parsed.data;
  if (id && isBuiltInProfile(id)) {
    return err(appError("validation", "The built-in Claude providers cannot be edited."));
  }
  const current = await getLlmSettings(deps);
  const existing = id ? current.profiles.find((p) => p.id === id) : undefined;
  if (id && !existing) return err(appError("not_found", "That provider no longer exists."));

  const profile: LlmProfile = {
    id: existing?.id ?? newProfileId(name, current.profiles),
    kind: "openai-compatible",
    name,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    keyRef: existing?.keyRef ?? null,
    models,
    caps: caps ?? existing?.caps ?? { jsonSchema: false, tools: false },
  };
  const profiles = existing
    ? current.profiles.map((p) => (p.id === profile.id ? profile : p))
    : [...current.profiles, profile];
  const tasks = Object.fromEntries(
    llmTasks.map((t) => {
      const r = current.tasks[t];
      return [
        t,
        r.profileId === profile.id && !models.includes(r.model) ? { ...r, model: models[0] } : r,
      ];
    }),
  ) as Record<LlmTask, TaskRoute>;
  const saved = await updateLlmSettings(deps, { ...current, profiles, tasks });
  return saved.ok ? ok(profile) : saved;
}

/** Deletes a custom profile and its keychain entry. Refuses while a task still uses it. */
export async function deleteLlmProfile(deps: SecretDeps, id: string): Promise<Result<void>> {
  if (isBuiltInProfile(id)) {
    return err(appError("validation", "The built-in Claude providers cannot be deleted."));
  }
  const current = await getLlmSettings(deps);
  const profile = current.profiles.find((p) => p.id === id);
  if (!profile) return err(appError("not_found", "That provider no longer exists."));
  const using = llmTasks.filter((t) => current.tasks[t].profileId === id);
  if (using.length > 0) {
    return err(
      appError(
        "conflict",
        `Route ${using.join(", ")} to another provider before deleting ${profile.name}.`,
      ),
    );
  }
  await deps.settings.saveLlmSettings({
    ...current,
    profiles: current.profiles.filter((p) => p.id !== id),
  });
  if (profile.keyRef && deps.secrets.available) {
    const removed = await keychain(() => deps.secrets.delete(profile.keyRef as string));
    if (!removed.ok) return removed;
  }
  return ok(undefined);
}

/** Stores a provider's API key in the OS keychain. The key never enters the settings row. */
export async function saveProviderKey(
  deps: SecretDeps,
  profileId: string,
  key: string,
): Promise<Result<void>> {
  const value = key.trim();
  if (value.length < 8 || /\s/.test(value)) {
    return err(appError("validation", "Paste the whole API key, with no spaces."));
  }
  const current = await getLlmSettings(deps);
  const profile = current.profiles.find((p) => p.id === profileId);
  if (!profile) return err(appError("not_found", "That provider no longer exists."));
  if (profile.kind === "claude-subscription") {
    return err(appError("validation", "The Claude subscription needs no key."));
  }
  if (!deps.secrets.available) return err(noKeychain(profile));
  const keyRef = profile.keyRef ?? `profile-${profile.id}`;
  const stored = await keychain(() => deps.secrets.set(keyRef, value));
  if (!stored.ok) return stored;
  if (profile.keyRef !== keyRef) {
    await deps.settings.saveLlmSettings({
      ...current,
      profiles: current.profiles.map((p) => (p.id === profileId ? { ...p, keyRef } : p)),
    });
  }
  return ok(undefined);
}

export async function deleteProviderKey(
  deps: SecretDeps,
  profileId: string,
): Promise<Result<void>> {
  const current = await getLlmSettings(deps);
  const profile = current.profiles.find((p) => p.id === profileId);
  if (!profile) return err(appError("not_found", "That provider no longer exists."));
  if (!profile.keyRef || !deps.secrets.available) return ok(undefined);
  return keychain(() => deps.secrets.delete(profile.keyRef as string));
}

/** What Settings may show about a key: never the key itself. */
export type ProviderKeyStatus = "env" | "saved" | "none" | "not-needed";

export async function getProviderKeyStatus(
  deps: SecretDeps & { envKeys: Partial<Record<LlmKeyEnvVar, boolean>> },
  profile: LlmProfile,
): Promise<ProviderKeyStatus> {
  if (profile.kind === "claude-subscription") return "not-needed";
  const envVar = envKeyVarFor(profile);
  if (envVar && deps.envKeys[envVar]) return "env";
  if (!profile.keyRef || !deps.secrets.available) return "none";
  const found = await keychain(() => deps.secrets.get(profile.keyRef as string));
  return found.ok && found.value ? "saved" : "none";
}

/**
 * The key an adapter should use for a profile: the environment first (ADR-0037), then the
 * keychain. Undefined when neither has one; local servers do not need a key.
 */
export async function resolveProviderKey(
  deps: { secrets: SecretStore; env: Partial<Record<LlmKeyEnvVar, string | undefined>> },
  profile: Pick<LlmProfile, "kind" | "baseUrl" | "keyRef">,
): Promise<string | undefined> {
  if (profile.kind === "claude-subscription") return undefined;
  const envVar = envKeyVarFor(profile);
  const fromEnv = envVar ? deps.env[envVar] : undefined;
  if (fromEnv) return fromEnv;
  if (!profile.keyRef || !deps.secrets.available) return undefined;
  const found = await keychain(() => deps.secrets.get(profile.keyRef as string));
  return (found.ok && found.value) || undefined;
}

function newProfileId(name: string, taken: LlmProfile[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "provider";
  const ids = new Set([...taken, ...builtInProfiles].map((p) => p.id));
  if (!ids.has(base)) return base;
  for (let n = 2; ; n++) if (!ids.has(`${base}-${n}`)) return `${base}-${n}`;
}

function noKeychain(profile: LlmProfile) {
  const envVar = envKeyVarFor(profile);
  return appError(
    "validation",
    `This computer has no keychain Thoth can use.${envVar ? ` Set ${envVar} in apps/web/.env.local instead.` : " Use a provider that needs no key."}`,
  );
}

/** Keychain calls fail on machines without one; that is an environment problem, not a bug. */
async function keychain<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await run());
  } catch (e) {
    return err(appError("validation", "The OS keychain refused the request.", e));
  }
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
