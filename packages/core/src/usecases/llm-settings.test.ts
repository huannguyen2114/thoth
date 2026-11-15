import { describe, expect, it } from "vitest";
import { defaultLlmSettings, type LlmSettings } from "../domain/llm-settings";
import type { SettingsRepository } from "../ports/repositories";
import { getLlmSettings, updateLlmSettings } from "./llm-settings";

class MemorySettings implements SettingsRepository {
  value: LlmSettings | null = null;
  async getLlmSettings() {
    return this.value;
  }
  async saveLlmSettings(s: LlmSettings) {
    this.value = s;
  }
}

describe("LLM settings", () => {
  it("falls back to defaults (Opus 5.5 everywhere) before the first save", async () => {
    const s = await getLlmSettings({ settings: new MemorySettings() });
    expect(s).toEqual(defaultLlmSettings);
    expect(Object.values(s.models).every((m) => m === "claude-opus-5-5")).toBe(true);
  });

  it("saves a valid choice and rejects an unknown model", async () => {
    const settings = new MemorySettings();
    const good = {
      ...defaultLlmSettings,
      models: { ...defaultLlmSettings.models, chapters: "claude-haiku-5-5" },
    };
    expect((await updateLlmSettings({ settings }, good)).ok).toBe(true);
    expect(settings.value?.models.chapters).toBe("claude-haiku-5-5");

    const bad = { ...good, models: { ...good.models, chat: "gpt-6" } };
    const r = await updateLlmSettings({ settings }, bad);
    expect(r.ok).toBe(false);
    expect(settings.value?.models.chat).toBe("claude-opus-5-5");
  });
});
