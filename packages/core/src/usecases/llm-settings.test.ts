import { describe, expect, it } from "vitest";
import { defaultLlmSettingsV2, type LlmSettingsV2 } from "../domain/llm-profiles";
import type { SettingsRepository } from "../ports/repositories";
import type { SecretStore } from "../ports/secrets";
import {
  deleteLlmProfile,
  getLlmSettings,
  getProviderKeyStatus,
  resolveProviderKey,
  saveLlmProfile,
  saveProviderKey,
  updateLlmRoutes,
  updateLlmSettings,
} from "./llm-settings";

class MemorySettings implements SettingsRepository {
  value: LlmSettingsV2 | null = null;
  async getLlmSettings() {
    return this.value;
  }
  async saveLlmSettings(s: LlmSettingsV2) {
    this.value = s;
  }
}

class MemorySecrets implements SecretStore {
  map = new Map<string, string>();
  constructor(readonly available = true) {}
  async get(ref: string) {
    return this.map.get(ref) ?? null;
  }
  async set(ref: string, v: string) {
    this.map.set(ref, v);
  }
  async delete(ref: string) {
    this.map.delete(ref);
  }
}

const ollama = {
  name: "Ollama",
  baseUrl: "http://localhost:11434/v1/",
  models: ["llama3.2", "qwen3:4b", "llama3.2"],
};

describe("LLM settings v2", () => {
  it("falls back to the subscription with Opus 5.5 everywhere before the first save", async () => {
    const s = await getLlmSettings({ settings: new MemorySettings() });
    expect(s).toEqual(defaultLlmSettingsV2);
    expect(Object.values(s.tasks).every((r) => r.model === "claude-opus-5-5")).toBe(true);
  });

  it("saves routes and rejects a model the profile does not offer", async () => {
    const settings = new MemorySettings();
    const tasks = {
      ...defaultLlmSettingsV2.tasks,
      chapters: { profileId: "anthropic-api", model: "claude-haiku-5-5" },
    };
    expect((await updateLlmRoutes({ settings }, tasks)).ok).toBe(true);
    expect(settings.value?.tasks.chapters.profileId).toBe("anthropic-api");

    const bad = { ...tasks, chat: { profileId: "claude-subscription", model: "gpt-6" } };
    const r = await updateLlmRoutes({ settings }, bad);
    expect(r.ok).toBe(false);
    expect(settings.value?.tasks.chat.model).toBe("claude-opus-5-5");

    const unknown = await updateLlmSettings(
      { settings },
      { ...defaultLlmSettingsV2, tasks: { ...tasks, quiz: { profileId: "nope", model: "x" } } },
    );
    expect(unknown.ok).toBe(false);
  });

  it("adds, edits and deletes an OpenAI-compatible profile", async () => {
    const settings = new MemorySettings();
    const secrets = new MemorySecrets();
    const added = await saveLlmProfile({ settings }, ollama);
    if (!added.ok) throw new Error(added.error.message);
    expect(added.value).toMatchObject({
      id: "ollama",
      kind: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      models: ["llama3.2", "qwen3:4b"],
    });
    // A second one with the same name gets its own id.
    const again = await saveLlmProfile({ settings }, ollama);
    expect(again.ok && again.value.id).toBe("ollama-2");

    // Route flashcards to it, then drop that model: the route moves to the first model.
    await updateLlmRoutes(
      { settings },
      { ...defaultLlmSettingsV2.tasks, flashcards: { profileId: "ollama", model: "qwen3:4b" } },
    );
    await saveLlmProfile({ settings }, { ...ollama, id: "ollama", models: ["llama3.2"] });
    expect(settings.value?.tasks.flashcards).toEqual({ profileId: "ollama", model: "llama3.2" });

    const blocked = await deleteLlmProfile({ settings, secrets }, "ollama");
    expect(!blocked.ok && blocked.error.code).toBe("conflict");
    expect((await deleteLlmProfile({ settings, secrets }, "ollama-2")).ok).toBe(true);
    expect(settings.value?.profiles.map((p) => p.id)).toEqual([
      "claude-subscription",
      "anthropic-api",
      "ollama",
    ]);
  });

  it("refuses to edit or delete the built-in Claude profiles", async () => {
    const settings = new MemorySettings();
    const secrets = new MemorySecrets();
    expect((await saveLlmProfile({ settings }, { ...ollama, id: "anthropic-api" })).ok).toBe(false);
    expect((await deleteLlmProfile({ settings, secrets }, "claude-subscription")).ok).toBe(false);
  });

  it("keeps keys in the secret store and reports only a status", async () => {
    const settings = new MemorySettings();
    const secrets = new MemorySecrets();
    const p = await saveLlmProfile(
      { settings },
      { name: "Router", baseUrl: "https://openrouter.ai/api/v1", models: ["x/y"] },
    );
    if (!p.ok) throw new Error(p.error.message);
    expect((await saveProviderKey({ settings, secrets }, p.value.id, "sk-or-123456789")).ok).toBe(
      true,
    );
    expect(JSON.stringify(settings.value)).not.toContain("sk-or-123456789");
    const saved = (await getLlmSettings({ settings })).profiles.find((x) => x.id === p.value.id);
    if (!saved) throw new Error("missing");
    expect(saved.keyRef).toBe("profile-router");
    expect(await getProviderKeyStatus({ settings, secrets, envKeys: {} }, saved)).toBe("saved");
    // The environment wins over the keychain.
    expect(
      await getProviderKeyStatus(
        { settings, secrets, envKeys: { OPENROUTER_API_KEY: true } },
        saved,
      ),
    ).toBe("env");
    expect(
      await resolveProviderKey({ secrets, env: { OPENROUTER_API_KEY: "from-env" } }, saved),
    ).toBe("from-env");
    expect(await resolveProviderKey({ secrets, env: {} }, saved)).toBe("sk-or-123456789");

    // Deleting the profile deletes the key.
    expect((await deleteLlmProfile({ settings, secrets }, p.value.id)).ok).toBe(true);
    expect(secrets.map.size).toBe(0);
  });

  it("explains the env fallback when there is no keychain", async () => {
    const settings = new MemorySettings();
    const secrets = new MemorySecrets(false);
    const p = await saveLlmProfile(
      { settings },
      { name: "OpenAI", baseUrl: "https://api.openai.com/v1", models: ["gpt-5-mini"] },
    );
    if (!p.ok) throw new Error(p.error.message);
    const r = await saveProviderKey({ settings, secrets }, p.value.id, "sk-123456789");
    expect(!r.ok && r.error.message).toContain("OPENAI_API_KEY");
    expect(await resolveProviderKey({ secrets, env: {} }, p.value)).toBeUndefined();
  });

  it("treats a keychain that throws as unavailable, not a crash", async () => {
    const settings = new MemorySettings();
    const secrets: SecretStore = {
      available: true,
      get: () => Promise.reject(new Error("locked")),
      set: () => Promise.reject(new Error("locked")),
      delete: () => Promise.reject(new Error("locked")),
    };
    const anthropic = defaultLlmSettingsV2.profiles[1];
    if (!anthropic) throw new Error("missing");
    expect(await resolveProviderKey({ secrets, env: {} }, anthropic)).toBeUndefined();
    const r = await saveProviderKey({ settings, secrets }, "anthropic-api", "sk-ant-123456789");
    expect(r.ok).toBe(false);
  });
});
