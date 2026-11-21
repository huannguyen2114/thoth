import { type LlmTask, llmTasks } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonLoose } from "./json-repair";
import {
  OpenAiCompatibleProvider,
  probeOpenAiCompatible,
  reasoningEffort,
  toStrictJsonSchema,
} from "./openai-compatible";

type Reply = { status: number; json: unknown } | { sse: unknown[] } | { throws: Error };

/** A fetch stub that records each request and answers from a queue. */
function stubFetch(...replies: Reply[]) {
  const calls: {
    url: string;
    method: string;
    body: Record<string, unknown>;
    auth: string | null;
  }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : {},
      auth: headers.get("authorization"),
    });
    const r = replies.shift();
    if (!r) throw new Error("unexpected request");
    if ("throws" in r) throw r.throws;
    if ("sse" in r) {
      const text = `${r.sse.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`;
      return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return new Response(JSON.stringify(r.json), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const completion = (content: string, extra: Record<string, unknown> = {}) => ({
  status: 200,
  json: {
    id: "c1",
    object: "chat.completion",
    created: 0,
    model: "m",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content, refusal: null, ...extra },
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  },
});

const ollama = {
  id: "ollama",
  name: "Ollama",
  baseUrl: "http://localhost:11434/v1",
  caps: { jsonSchema: false, tools: false },
};
const models = Object.fromEntries(llmTasks.map((t) => [t, "llama3.2"])) as Record<LlmTask, string>;

function provider(
  fetchFn: typeof fetch,
  opts: { jsonSchema?: boolean; model?: string; baseUrl?: string; apiKey?: string } = {},
) {
  return new OpenAiCompatibleProvider({
    profile: {
      ...ollama,
      baseUrl: opts.baseUrl ?? ollama.baseUrl,
      caps: { jsonSchema: opts.jsonSchema ?? false, tools: false },
    },
    models: opts.model ? { ...models, flashcards: opts.model } : models,
    apiKey: opts.apiKey,
    fetch: fetchFn,
    maxRetries: 0,
  });
}

const req = {
  task: "flashcards" as const,
  system: "You write flashcards.",
  context: "Mitochondria make ATP.",
  messages: [{ role: "user" as const, content: "Two cards." }],
};

const cards = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })).min(1),
});
const goodCards = JSON.stringify({ cards: [{ front: "What makes ATP?", back: "Mitochondria" }] });

describe("OpenAiCompatibleProvider", () => {
  it("sends system, source context as an extra system message, then the turns", async () => {
    const { fetchFn, calls } = stubFetch(completion("Hello"));
    const r = await provider(fetchFn).generateText(req);
    expect(r).toEqual({ ok: true, value: "Hello" });
    const call = calls[0];
    expect(call?.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(call?.body.model).toBe("llama3.2");
    expect(call?.body.messages).toEqual([
      { role: "system", content: "You write flashcards." },
      { role: "system", content: "<source>\nMitochondria make ATP.\n</source>" },
      { role: "user", content: "Two cards." },
    ]);
    // llama3.2 does not take reasoning_effort, and no max tokens unless asked for.
    expect(call?.body).not.toHaveProperty("reasoning_effort");
    expect(call?.body).not.toHaveProperty("max_tokens");
    // A placeholder key, never OPENAI_API_KEY from the environment.
    expect(call?.auth).toBe("Bearer not-needed");
  });

  it("maps effort to reasoning_effort only for reasoning models, and uses max_completion_tokens on OpenAI", async () => {
    const { fetchFn, calls } = stubFetch(completion("ok"));
    await provider(fetchFn, {
      model: "gpt-5-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
    }).generateText({ ...req, effort: "max", maxTokens: 100 });
    expect(calls[0]?.body).toMatchObject({ reasoning_effort: "high", max_completion_tokens: 100 });
    expect(calls[0]?.auth).toBe("Bearer sk-test");
    expect(reasoningEffort("openai/o4-mini", "low")).toBe("low");
    expect(reasoningEffort("qwen3:4b", "high")).toBeNull();
  });

  it("strips a reasoning model's <think> block", async () => {
    const { fetchFn } = stubFetch(completion("<think>hmm</think>\nParis."));
    expect(await provider(fetchFn).generateText(req)).toEqual({ ok: true, value: "Paris." });
  });

  it("uses json_schema with strict when the profile supports it", async () => {
    const { fetchFn, calls } = stubFetch(completion(goodCards));
    const r = await provider(fetchFn, { jsonSchema: true }).generateObject(req, cards);
    expect(r.ok && r.value.cards[0]?.back).toBe("Mitochondria");
    const format = calls[0]?.body.response_format as {
      type: string;
      json_schema: { strict: boolean; schema: Record<string, unknown> };
    };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.schema).not.toHaveProperty("$schema");
    expect(format.json_schema.schema.required).toEqual(["cards"]);
  });

  it("uses JSON mode with the schema in the prompt otherwise, and repairs fenced JSON", async () => {
    const { fetchFn, calls } = stubFetch(
      completion(`Sure! Here you go:\n\`\`\`json\n${goodCards.replace("}]}", "},]}")}\n\`\`\``),
    );
    const r = await provider(fetchFn).generateObject(req, cards);
    expect(r.ok).toBe(true);
    expect(calls[0]?.body.response_format).toEqual({ type: "json_object" });
    const system =
      (calls[0]?.body.messages as { content: string }[] | undefined)?.[0]?.content ?? "";
    expect(system).toContain("JSON Schema");
    expect(system).toContain('"front"');
  });

  it("retries once with the validation problem, then succeeds", async () => {
    const { fetchFn, calls } = stubFetch(completion('{"cards": []}'), completion(goodCards));
    const r = await provider(fetchFn).generateObject(req, cards);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    const retry = calls[1]?.body.messages as { role: string; content: string }[];
    expect(retry.at(-2)).toEqual({ role: "assistant", content: '{"cards": []}' });
    expect(retry.at(-1)?.content).toContain("cards");
  });

  it("returns llm_bad_output after the one retry", async () => {
    const { fetchFn, calls } = stubFetch(completion("no idea"), completion("still no"));
    const r = await provider(fetchFn).generateObject(req, cards);
    expect(!r.ok && r.error.code).toBe("llm_bad_output");
    expect(calls).toHaveLength(2);
  });

  it("falls back from json_schema to JSON mode when the server rejects the format", async () => {
    const { fetchFn, calls } = stubFetch(
      { status: 400, json: { error: { message: "response_format json_schema not supported" } } },
      completion(goodCards),
    );
    const r = await provider(fetchFn, { jsonSchema: true }).generateObject(req, cards);
    expect(r.ok).toBe(true);
    expect((calls[1]?.body.response_format as { type: string } | undefined)?.type).toBe(
      "json_object",
    );
  });

  it("maps a refusal to llm_refused", async () => {
    const { fetchFn } = stubFetch(completion("", { refusal: "I can't help with that." }));
    const r = await provider(fetchFn, { jsonSchema: true }).generateObject(req, cards);
    expect(!r.ok && r.error.code).toBe("llm_refused");
  });

  it.each([
    [
      { throws: new TypeError("fetch failed") },
      "Ollama is not running at http://localhost:11434/v1",
    ],
    [
      { status: 404, json: { error: { message: 'model "llama3.2" not found' } } },
      "ollama pull llama3.2",
    ],
    [{ status: 401, json: { error: { message: "bad key" } } }, "rejected the API key"],
    [{ status: 429, json: { error: { message: "slow down" } } }, "rate limit"],
  ] as const)("maps errors to llm_unavailable with a fix (%#)", async (reply, text) => {
    const { fetchFn } = stubFetch(reply as Reply);
    const r = await provider(fetchFn).generateText(req);
    expect(!r.ok && r.error.code).toBe("llm_unavailable");
    expect(!r.ok && r.error.message).toContain(text);
  });

  it("names LM Studio when its local server is down", async () => {
    const { fetchFn } = stubFetch({ throws: new TypeError("fetch failed") });
    const r = await provider(fetchFn, { baseUrl: "http://127.0.0.1:1234/v1" }).generateText(req);
    expect(!r.ok && r.error.message).toContain("LM Studio");
  });

  it("streams deltas, hides <think>, and reports usage", async () => {
    const chunk = (content: string | null, finish: string | null = null, usage?: unknown) => ({
      id: "s",
      object: "chat.completion.chunk",
      created: 0,
      model: "m",
      choices:
        content === null && finish === null
          ? []
          : [{ index: 0, delta: content === null ? {} : { content }, finish_reason: finish }],
      ...(usage ? { usage } : {}),
    });
    const { fetchFn, calls } = stubFetch({
      sse: [
        chunk("<thi"),
        chunk("nk>plan</think>"),
        chunk("Hel"),
        chunk("lo"),
        chunk(null, "stop"),
        chunk(null, null, { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 }),
      ],
    });
    const events = [];
    for await (const e of provider(fetchFn).streamText(req)) events.push(e);
    expect(calls[0]?.body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(
      events
        .filter((e) => e.type === "text")
        .map((e) => (e as { delta: string }).delta)
        .join(""),
    ).toBe("Hello");
    expect(events.at(-1)).toEqual({ type: "done", usage: { inputTokens: 4, outputTokens: 2 } });
  });

  it("streams an error event when the server is down", async () => {
    const { fetchFn } = stubFetch({ throws: new TypeError("fetch failed") });
    const events = [];
    for await (const e of provider(fetchFn).streamText(req)) events.push(e);
    expect(events).toEqual([
      { type: "error", message: expect.stringContaining("Ollama is not running") },
    ]);
  });
});

describe("probeOpenAiCompatible", () => {
  const list = {
    status: 200,
    json: {
      object: "list",
      data: [
        { id: "qwen3:4b", object: "model" },
        { id: "llama3.2", object: "model" },
      ],
    },
  };

  it("lists models and detects json_schema support", async () => {
    const { fetchFn, calls } = stubFetch(list, completion('{"answer": 5}'));
    const r = await probeOpenAiCompatible({
      name: "Ollama",
      baseUrl: ollama.baseUrl,
      fetch: fetchFn,
    });
    expect(r).toEqual({
      ok: true,
      value: { models: ["llama3.2", "qwen3:4b"], model: "llama3.2", jsonSchema: true, note: null },
    });
    expect(calls[0]?.url).toBe("http://localhost:11434/v1/models");
  });

  it("reports JSON mode when the server rejects the schema", async () => {
    const { fetchFn } = stubFetch(list, { status: 400, json: { error: { message: "no" } } });
    const r = await probeOpenAiCompatible({
      name: "X",
      baseUrl: "http://localhost:8000/v1",
      model: "qwen3:4b",
      fetch: fetchFn,
    });
    expect(r.ok && r.value).toMatchObject({ model: "qwen3:4b", jsonSchema: false });
  });

  it("fails clearly when the server is not running", async () => {
    const { fetchFn } = stubFetch({ throws: new TypeError("fetch failed") });
    const r = await probeOpenAiCompatible({
      name: "Ollama",
      baseUrl: ollama.baseUrl,
      fetch: fetchFn,
    });
    expect(!r.ok && r.error.message).toContain("Ollama is not running");
  });
});

describe("structured output helpers", () => {
  it("marks schemas with optional fields as non-strict", () => {
    expect(toStrictJsonSchema(cards).strict).toBe(true);
    expect(toStrictJsonSchema(z.object({ a: z.string().optional() })).strict).toBe(false);
  });

  it("repairs common local-model JSON mistakes", () => {
    expect(parseJsonLoose('<think>x</think>{"a": [1, 2,],}')).toEqual({
      ok: true,
      value: { a: [1, 2] },
    });
    expect(parseJsonLoose('Here: {"a": "}"} hope that helps')).toEqual({
      ok: true,
      value: { a: "}" },
    });
    expect(parseJsonLoose("nothing here").ok).toBe(false);
  });
});
