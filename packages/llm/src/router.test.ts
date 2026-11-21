import { defaultLlmSettingsV2, type LlmProfile, type LlmSettingsV2 } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeLlmProvider } from "./fake-provider";
import { buildAdapter, RoutedLlmProvider } from "./router";

const ollama: LlmProfile = {
  id: "ollama",
  kind: "openai-compatible",
  name: "Ollama",
  baseUrl: "http://localhost:11434/v1",
  keyRef: null,
  models: ["llama3.2"],
  caps: { jsonSchema: false, tools: false },
};

const settings: LlmSettingsV2 = {
  ...defaultLlmSettingsV2,
  profiles: [...defaultLlmSettingsV2.profiles, ollama],
  tasks: { ...defaultLlmSettingsV2.tasks, flashcards: { profileId: "ollama", model: "llama3.2" } },
};

describe("RoutedLlmProvider", () => {
  it("dispatches each request to its task's profile and model, building each adapter once", async () => {
    const built: string[] = [];
    const keys: string[] = [];
    const router = new RoutedLlmProvider(settings, {
      resolveKey: async (p) => {
        keys.push(p.id);
        return undefined;
      },
      build: (profile, model) => {
        built.push(`${profile.id}:${model}`);
        return new FakeLlmProvider((req) =>
          req.task === "flashcards"
            ? model === "x"
              ? ""
              : profile.id === "ollama"
                ? req.system === "obj"
                  ? '{"n":1}'
                  : "ollama"
                : ""
            : "claude",
        );
      },
    });
    expect((await router.generateText({ task: "chat", system: "", messages: [] })).ok).toBe(true);
    const r = await router.generateText({ task: "flashcards", system: "", messages: [] });
    expect(r).toEqual({ ok: true, value: "ollama" });
    const o = await router.generateObject(
      { task: "flashcards", system: "obj", messages: [] },
      z.object({ n: z.number() }),
    );
    expect(o).toEqual({ ok: true, value: { n: 1 } });
    expect(built).toEqual(["claude-subscription:claude-opus-5-5", "ollama:llama3.2"]);
    expect(keys).toEqual(["claude-subscription", "ollama"]);
  });

  it("builds the right adapter kind", () => {
    expect(buildAdapter(ollama, "llama3.2", undefined).id).toBe("openai-compatible");
    const [sub, api] = defaultLlmSettingsV2.profiles;
    if (!sub || !api) throw new Error("missing");
    expect(buildAdapter(sub, "claude-opus-5-5", undefined).id).toBe("claude-subscription");
    expect(buildAdapter(api, "claude-opus-5-5", "sk-ant-x").id).toBe("anthropic-api");
  });
});
