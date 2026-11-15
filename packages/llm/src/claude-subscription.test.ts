import type { Options, query } from "@anthropic-ai/claude-agent-sdk";
import { defaultLlmSettings } from "@thoth/core";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ClaudeSubscriptionProvider, toPrompt } from "./claude-subscription";

const success = (extra: object = {}) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "Hello from Claude",
  stop_reason: "end_turn",
  usage: { input_tokens: 5, output_tokens: 4 },
  ...extra,
});

/** Fake Agent SDK query(): records options, replays the given messages. */
function stubQuery(messages: object[]) {
  const seen: Options[] = [];
  const fn = ((args: { options?: Options }) => {
    if (args.options) seen.push(args.options);
    return (async function* () {
      for (const m of messages) yield m;
    })();
  }) as unknown as typeof query;
  return { fn, seen };
}

const req = {
  task: "chat" as const,
  system: "S",
  messages: [{ role: "user" as const, content: "hi" }],
};
const models = defaultLlmSettings.models;

describe("ClaudeSubscriptionProvider", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it("runs isolated: no tools, no settings, no session, no API key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-should-not-leak";
    const { fn, seen } = stubQuery([success()]);
    const r = await new ClaudeSubscriptionProvider({ models, query: fn }).generateText(req);
    expect(r).toEqual({ ok: true, value: "Hello from Claude" });
    const o = seen[0];
    expect(o?.tools).toEqual([]);
    expect(o?.settingSources).toEqual([]);
    expect(o?.persistSession).toBe(false);
    expect(o?.strictMcpConfig).toBe(true);
    expect(o?.model).toBe("claude-opus-5-5");
    expect(o?.effort).toBe("medium");
    expect(o?.env).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("streams partial text deltas then done", async () => {
    const delta = (text: string) => ({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text } },
    });
    const { fn, seen } = stubQuery([delta("Hel"), delta("lo"), success()]);
    const events = [];
    for await (const e of new ClaudeSubscriptionProvider({ models, query: fn }).streamText(req)) {
      events.push(e);
    }
    expect(events).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
      { type: "done", usage: { inputTokens: 5, outputTokens: 4 } },
    ]);
    expect(seen[0]?.includePartialMessages).toBe(true);
  });

  it("validates structured_output with the zod schema", async () => {
    const schema = z.object({ answer: z.string() });
    const good = stubQuery([success({ structured_output: { answer: "42" } })]);
    const r = await new ClaudeSubscriptionProvider({ models, query: good.fn }).generateObject(
      req,
      schema,
    );
    expect(r).toEqual({ ok: true, value: { answer: "42" } });
    expect(good.seen[0]?.outputFormat?.type).toBe("json_schema");

    const bad = stubQuery([success({ structured_output: { answer: 42 } })]);
    const r2 = await new ClaudeSubscriptionProvider({ models, query: bad.fn }).generateObject(
      req,
      schema,
    );
    expect(r2.ok === false && r2.error.code).toBe("llm_bad_output");
  });

  it("maps an error result to llm_unavailable", async () => {
    const { fn } = stubQuery([
      { type: "result", subtype: "error_during_execution", is_error: true, errors: ["boom"] },
    ]);
    const r = await new ClaudeSubscriptionProvider({ models, query: fn }).generateText(req);
    expect(r.ok === false && r.error.code).toBe("llm_unavailable");
  });

  it("renders multi-turn history as a transcript", () => {
    const p = toPrompt({
      ...req,
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
    });
    expect(p).toContain("<assistant>\nb\n</assistant>");
    expect(p.endsWith("last user turn.")).toBe(true);
  });
});

describe("ClaudeSubscriptionProvider auth errors", () => {
  it("surfaces the CLI's message and a sign-in hint", async () => {
    const { fn } = stubQuery([
      success({ is_error: true, result: "Failed to authenticate: OAuth session expired" }),
    ]);
    const r = await new ClaudeSubscriptionProvider({ models, query: fn }).generateText(req);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("OAuth session expired");
      expect(r.error.message).toContain("/login");
    }
  });
});
