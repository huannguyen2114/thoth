/**
 * Live smoke tests against real providers. Skipped unless THOTH_LIVE is set:
 *   THOTH_LIVE=subscription pnpm --filter @thoth/llm test live
 *   THOTH_LIVE=api,subscription THOTH_LIVE_MODEL=claude-haiku-5-5 pnpm --filter @thoth/llm test live
 * Each run sends a few short prompts and uses real quota.
 */
import { type defaultLlmSettings, type LlmModel, type LlmProvider, llmTasks } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicApiProvider } from "./anthropic-api";
import { ClaudeSubscriptionProvider } from "./claude-subscription";

const enabled = (process.env.THOTH_LIVE ?? "").split(",").filter(Boolean);
const model = (process.env.THOTH_LIVE_MODEL ?? "claude-sonnet-5-5") as LlmModel;
const models = Object.fromEntries(
  llmTasks.map((t) => [t, model]),
) as typeof defaultLlmSettings.models;

const providers: [string, () => LlmProvider][] = [
  ["subscription", () => new ClaudeSubscriptionProvider({ models })],
  ["api", () => new AnthropicApiProvider({ models })],
];

const quizSchema = z.object({
  question: z.string().min(5),
  choices: z.array(z.string()).length(4),
  answerIndex: z.number().int().min(0).max(3),
});

for (const [name, make] of providers) {
  describe.skipIf(!enabled.includes(name))(`live: ${name} (${model})`, () => {
    it("returns schema-valid structured output", { timeout: 120_000 }, async () => {
      const r = await make().generateObject(
        {
          task: "quiz",
          system: "You write one multiple-choice question about the source.",
          context: "Mitochondria produce most of the cell's ATP through oxidative phosphorylation.",
          messages: [{ role: "user", content: "Write one question with 4 choices." }],
        },
        quizSchema,
      );
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message} :: ${String(r.error.cause)}`);
      expect(quizSchema.safeParse(r.value).success).toBe(true);
      console.log(`[${name}]`, JSON.stringify(r.value));
    });

    it("streams text", { timeout: 120_000 }, async () => {
      let text = "";
      let done = false;
      for await (const e of make().streamText({
        task: "chat",
        effort: "low",
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
}
