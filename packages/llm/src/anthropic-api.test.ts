import type Anthropic from "@anthropic-ai/sdk";
import { defaultLlmSettings } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicApiProvider } from "./anthropic-api";

type Msg = {
  stop_reason: string;
  stop_details?: unknown;
  content: unknown[];
  usage: object;
  parsed_output?: unknown;
};

/** Minimal stand-in for the SDK client: records params, returns a canned message. */
function stubClient(reply: Msg) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          calls.push(params);
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hi " } };
              yield { type: "content_block_delta", delta: { type: "text_delta", text: "there" } };
            },
            finalMessage: async () => reply,
          };
        },
        parse: async (params: Record<string, unknown>) => {
          calls.push(params);
          return reply;
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const ok: Msg = {
  stop_reason: "end_turn",
  content: [{ type: "text", text: "Hello" }],
  usage: { input_tokens: 3, output_tokens: 1 },
};
const models = { ...defaultLlmSettings.models, chapters: "claude-haiku-5-5" as const };

describe("AnthropicApiProvider", () => {
  it("sends effort, cached context and refusal fallbacks for Opus 5.5", async () => {
    const { client, calls } = stubClient(ok);
    const llm = new AnthropicApiProvider({ models, client });
    const r = await llm.generateText({
      task: "quiz",
      system: "S",
      context: "SOURCE",
      messages: [{ role: "user", content: "q" }],
    });
    expect(r).toEqual({ ok: true, value: "Hello" });
    const p = calls[0] as Record<string, unknown> & { system: { cache_control?: unknown }[] };
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.output_config).toEqual({ effort: "high" });
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.system[1]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("omits fallbacks for Haiku 5.5", async () => {
    const { client, calls } = stubClient(ok);
    await new AnthropicApiProvider({ models, client }).generateText({
      task: "chapters",
      system: "S",
      messages: [{ role: "user", content: "q" }],
    });
    expect(calls[0]?.model).toBe("claude-haiku-5-5");
    expect(calls[0]).not.toHaveProperty("fallbacks");
  });

  it("maps a refusal to llm_refused", async () => {
    const { client } = stubClient({
      ...ok,
      stop_reason: "refusal",
      stop_details: { explanation: "x" },
    });
    const r = await new AnthropicApiProvider({ models, client }).generateText({
      task: "chat",
      system: "S",
      messages: [{ role: "user", content: "q" }],
    });
    expect(r.ok === false && r.error.code).toBe("llm_refused");
  });

  it("streams text deltas then done", async () => {
    const { client } = stubClient(ok);
    const events = [];
    for await (const e of new AnthropicApiProvider({ models, client }).streamText({
      task: "chat",
      system: "S",
      messages: [{ role: "user", content: "q" }],
    })) {
      events.push(e);
    }
    expect(events.map((e) => e.type)).toEqual(["text", "text", "done"]);
  });

  it("returns parsed structured output, or llm_bad_output when null", async () => {
    const schema = z.object({ answer: z.string() });
    const req = {
      task: "quiz" as const,
      system: "S",
      messages: [{ role: "user" as const, content: "q" }],
    };
    const good = stubClient({ ...ok, parsed_output: { answer: "42" } });
    expect(
      await new AnthropicApiProvider({ models, client: good.client }).generateObject(req, schema),
    ).toEqual({
      ok: true,
      value: { answer: "42" },
    });
    expect(
      (good.calls[0]?.output_config as { format?: unknown } | undefined)?.format,
    ).toBeDefined();
    const bad = stubClient({ ...ok, parsed_output: null });
    const r = await new AnthropicApiProvider({ models, client: bad.client }).generateObject(
      req,
      schema,
    );
    expect(r.ok === false && r.error.code).toBe("llm_bad_output");
  });
});
