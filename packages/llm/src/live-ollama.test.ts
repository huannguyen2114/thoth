/**
 * Live test against a local Ollama. Skipped unless THOTH_LIVE_OLLAMA=1:
 *   THOTH_LIVE_OLLAMA=1 THOTH_OLLAMA_MODEL=llama3.2 pnpm --filter @thoth/llm test live-ollama
 * Needs `ollama serve` (or the Ollama app) and the model pulled. Free, runs on this machine.
 */
import { type LlmTask, llmTasks } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OpenAiCompatibleProvider, probeOpenAiCompatible } from "./openai-compatible";

const enabled = process.env.THOTH_LIVE_OLLAMA === "1";
const baseUrl = process.env.THOTH_OLLAMA_URL ?? "http://localhost:11434/v1";
const model = process.env.THOTH_OLLAMA_MODEL ?? "llama3.2";

const cards = z.object({
  cards: z.array(z.object({ front: z.string().min(3), back: z.string().min(1) })).min(1),
});

describe.skipIf(!enabled)(`live: Ollama (${model})`, () => {
  it("lists models and probes structured output", { timeout: 120_000 }, async () => {
    const r = await probeOpenAiCompatible({ name: "Ollama", baseUrl, model });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.models).toContain(model.includes(":") ? model : `${model}:latest`);
    console.log("[ollama probe]", JSON.stringify(r.value));
  });

  for (const jsonSchema of [true, false]) {
    it(`writes schema-valid flashcards (${jsonSchema ? "json_schema" : "JSON mode"})`, {
      timeout: 300_000,
    }, async () => {
      const provider = new OpenAiCompatibleProvider({
        profile: { id: "ollama", name: "Ollama", baseUrl, caps: { jsonSchema, tools: false } },
        models: Object.fromEntries(llmTasks.map((t) => [t, model])) as Record<LlmTask, string>,
      });
      const r = await provider.generateObject(
        {
          task: "flashcards",
          system: "You write study flashcards about the source. Reply in JSON.",
          context: "Mitochondria produce most of the cell's ATP through oxidative phosphorylation.",
          messages: [{ role: "user", content: "Write two flashcards." }],
        },
        cards,
      );
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
      expect(cards.safeParse(r.value).success).toBe(true);
      console.log(`[ollama ${jsonSchema}]`, JSON.stringify(r.value));
    });
  }

  it("streams text", { timeout: 120_000 }, async () => {
    const provider = new OpenAiCompatibleProvider({
      profile: { id: "ollama", name: "Ollama", baseUrl, caps: { jsonSchema: false, tools: false } },
      models: Object.fromEntries(llmTasks.map((t) => [t, model])) as Record<LlmTask, string>,
    });
    let text = "";
    let done = false;
    for await (const e of provider.streamText({
      task: "chat",
      system: "Be brief.",
      messages: [{ role: "user", content: "Name two planets." }],
    })) {
      if (e.type === "text") text += e.delta;
      if (e.type === "error") throw new Error(e.message);
      if (e.type === "done") done = true;
    }
    expect(done).toBe(true);
    expect(text.length).toBeGreaterThan(3);
  });
});
