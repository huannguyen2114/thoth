import { describe, expect, it } from "vitest";
import { defaultLlmSettingsV2, llmSettingsV2Schema, readLlmSettings } from "./llm-profiles";
import { defaultLlmSettings, llmTasks } from "./llm-settings";

describe("LLM settings v2", () => {
  it("upgrades a stored v1 value, keeping each task's model", () => {
    const v1 = {
      ...defaultLlmSettings,
      provider: "anthropic-api" as const,
      models: { ...defaultLlmSettings.models, chapters: "claude-haiku-5-5" as const },
    };
    const v2 = readLlmSettings(v1);
    expect(v2?.version).toBe(2);
    expect(v2?.tasks.chapters).toEqual({ profileId: "anthropic-api", model: "claude-haiku-5-5" });
    expect(v2?.tasks.chat.profileId).toBe("anthropic-api");
  });

  it("reads v2 as is and rejects junk", () => {
    expect(readLlmSettings(defaultLlmSettingsV2)).toEqual(defaultLlmSettingsV2);
    expect(readLlmSettings({ nope: true })).toBeNull();
  });

  it("rejects a task routed to a profile that is not saved", () => {
    const bad = {
      ...defaultLlmSettingsV2,
      tasks: { ...defaultLlmSettingsV2.tasks, quiz: { profileId: "gone", model: "x" } },
    };
    expect(llmSettingsV2Schema.safeParse(bad).success).toBe(false);
    expect(Object.keys(defaultLlmSettingsV2.tasks)).toEqual([...llmTasks]);
  });
});
