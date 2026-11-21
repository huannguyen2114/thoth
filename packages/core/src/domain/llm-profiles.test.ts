import { describe, expect, it } from "vitest";
import {
  defaultLlmSettingsV2,
  envKeyVarFor,
  llmSettingsV2Schema,
  readLlmSettings,
} from "./llm-profiles";
import { llmTasks } from "./llm-settings";

const v1Models = Object.fromEntries(llmTasks.map((t) => [t, "claude-opus-5-5"]));

describe("LLM settings v2", () => {
  it("upgrades a stored v1 value, keeping each task's model", () => {
    const v1 = {
      provider: "anthropic-api",
      models: { ...v1Models, chapters: "claude-haiku-5-5" },
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

  it("picks the env var that overrides a profile's key", () => {
    const oc = (baseUrl: string) => ({ kind: "openai-compatible" as const, baseUrl });
    expect(envKeyVarFor({ kind: "anthropic-api", baseUrl: null })).toBe("ANTHROPIC_API_KEY");
    expect(envKeyVarFor(oc("https://api.openai.com/v1"))).toBe("OPENAI_API_KEY");
    expect(envKeyVarFor(oc("https://openrouter.ai/api/v1"))).toBe("OPENROUTER_API_KEY");
    expect(envKeyVarFor(oc("http://localhost:11434/v1"))).toBeNull();
    expect(envKeyVarFor({ kind: "claude-subscription", baseUrl: null })).toBeNull();
  });
});
