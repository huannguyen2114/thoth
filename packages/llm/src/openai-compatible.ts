import {
  type AppError,
  appError,
  defaultEffortByTask,
  envKeyVarFor,
  err,
  type LlmEffort,
  type LlmProfile,
  type LlmProvider,
  type LlmRequest,
  type LlmStreamEvent,
  type LlmTask,
  ok,
  type Result,
} from "@thoth/core";
import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { z } from "zod";
import { parseJsonLoose } from "./json-repair";

type Fetch = typeof fetch;
type Params = ChatCompletionCreateParamsNonStreaming;
type ResponseFormat = NonNullable<Params["response_format"]>;

export type OpenAiCompatibleProfile = Pick<LlmProfile, "id" | "name" | "baseUrl" | "caps">;

export interface OpenAiCompatibleOptions {
  profile: OpenAiCompatibleProfile;
  models: Record<LlmTask, string>;
  /** From the keychain or the environment. Local servers need none. */
  apiKey?: string | undefined;
  /** Injected in tests. */
  fetch?: Fetch;
  /** SDK retries for 429, 5xx and dropped connections. Default 1. */
  maxRetries?: number;
}

/**
 * Any OpenAI-compatible chat-completions server: Ollama, LM Studio, OpenRouter, OpenAI or a
 * custom base URL (ADR-0037, doc 20). Structured output uses `json_schema` when the profile's
 * `caps.jsonSchema` says the server supports it, otherwise JSON mode with the schema in the
 * prompt; either way zod validates, the JSON is repaired and a bad reply is retried once.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id = "openai-compatible" as const;
  private readonly client: OpenAI;

  constructor(private readonly opts: OpenAiCompatibleOptions) {
    this.client = openAiClient(
      opts.profile.baseUrl ?? "",
      opts.apiKey,
      opts.fetch,
      opts.maxRetries,
    );
  }

  private model(req: LlmRequest) {
    return this.opts.models[req.task];
  }

  private params(req: LlmRequest, extraSystem?: string): Params {
    const model = this.model(req);
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: extraSystem ? `${req.system}\n\n${extraSystem}` : req.system },
    ];
    if (req.context) {
      messages.push({ role: "system", content: `<source>\n${req.context}\n</source>` });
    }
    messages.push(...req.messages.map((m) => ({ role: m.role, content: m.content })));
    const effort = reasoningEffort(model, req.effort ?? defaultEffortByTask[req.task]);
    return {
      model,
      messages,
      ...(req.maxTokens ? maxTokensParam(this.opts.profile.baseUrl, req.maxTokens) : {}),
      ...(effort ? { reasoning_effort: effort } : {}),
    };
  }

  async generateText(req: LlmRequest): Promise<Result<string>> {
    try {
      const res = await this.client.chat.completions.create(this.params(req), {
        signal: req.signal,
      });
      const choice = res.choices[0];
      if (choice?.message.refusal || choice?.finish_reason === "content_filter") {
        return err(refused(choice?.message.refusal));
      }
      return ok(stripThinking(choice?.message.content ?? ""));
    } catch (e) {
      return err(this.error(e, req));
    }
  }

  async *streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    try {
      const stream = await this.client.chat.completions.create(
        { ...this.params(req), stream: true, stream_options: { include_usage: true } },
        { signal: req.signal },
      );
      let usage: { inputTokens: number; outputTokens: number } | undefined;
      let refusal = "";
      const think = new ThinkFilter();
      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
        const choice = chunk.choices[0];
        if (!choice) continue;
        if (choice.delta.refusal) refusal += choice.delta.refusal;
        const text = choice.delta.content ? think.push(choice.delta.content) : "";
        if (text) yield { type: "text", delta: text };
        if (choice.finish_reason === "content_filter") {
          yield { type: "error", message: refused(refusal).message };
          return;
        }
      }
      if (refusal) {
        yield { type: "error", message: refused(refusal).message };
        return;
      }
      yield usage ? { type: "done", usage } : { type: "done" };
    } catch (e) {
      yield { type: "error", message: this.error(e, req).message };
    }
  }

  async generateObject<S extends z.ZodType>(
    req: LlmRequest,
    schema: S,
  ): Promise<Result<z.infer<S>>> {
    const jsonSchema = toStrictJsonSchema(schema);
    // Degrade on a 400 that rejects the format: json_schema → JSON mode → prompt only.
    const ladder: ("json_schema" | "json_object" | "prompt")[] = this.opts.profile.caps.jsonSchema
      ? ["json_schema", "json_object", "prompt"]
      : ["json_object", "prompt"];
    let mode = ladder.shift() ?? "prompt";
    let retried = false;
    const history = [...req.messages];

    for (;;) {
      const describe =
        mode === "json_schema"
          ? undefined
          : `Reply with only one JSON value, no prose and no code fences. It must match this JSON Schema:\n${JSON.stringify(jsonSchema.schema)}`;
      const base = this.params({ ...req, messages: history }, describe);
      const response_format: ResponseFormat | undefined =
        mode === "json_schema"
          ? {
              type: "json_schema",
              json_schema: {
                name: "thoth_output",
                strict: jsonSchema.strict,
                schema: jsonSchema.schema,
              },
            }
          : mode === "json_object"
            ? { type: "json_object" }
            : undefined;
      let content: string;
      try {
        const res = await this.client.chat.completions.create(
          response_format ? { ...base, response_format } : base,
          { signal: req.signal },
        );
        const choice = res.choices[0];
        if (choice?.message.refusal || choice?.finish_reason === "content_filter") {
          return err(refused(choice?.message.refusal));
        }
        content = choice?.message.content ?? "";
      } catch (e) {
        const next = ladder.shift();
        if (e instanceof OpenAI.BadRequestError && next) {
          mode = next;
          continue;
        }
        return err(this.error(e, req));
      }

      const problem = check(schema, content);
      if (problem.ok) return ok(problem.value as z.infer<S>);
      if (retried) {
        return err(
          appError(
            "llm_bad_output",
            `The model reply did not match the expected shape. ${problem.reason}`,
          ),
        );
      }
      retried = true;
      history.push(
        { role: "assistant", content: content.slice(0, 4000) },
        {
          role: "user",
          content: `That reply could not be used: ${problem.reason} Reply again with only the corrected JSON.`,
        },
      );
    }
  }

  private error(e: unknown, req: LlmRequest): AppError {
    return toOpenAiAppError(e, this.opts.profile, this.model(req));
  }
}

function check(
  schema: z.ZodType,
  content: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  const json = parseJsonLoose(content);
  if (!json.ok) return { ok: false, reason: "It was not valid JSON." };
  const parsed = schema.safeParse(json.value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, reason: `It did not match the schema (${issues}).` };
}

/** One client per base URL. Never let the SDK pick up OPENAI_* env for another host. */
export function openAiClient(
  baseUrl: string,
  apiKey: string | undefined,
  fetchFn?: Fetch,
  maxRetries = 1,
) {
  return new OpenAI({
    baseURL: baseUrl,
    // Local servers ignore the key, but the SDK requires one and would otherwise read
    // OPENAI_API_KEY from the environment and send it to whatever host this is.
    apiKey: apiKey || "not-needed",
    organization: null,
    project: null,
    maxRetries,
    timeout: 10 * 60_000,
    ...(fetchFn ? { fetch: fetchFn } : {}),
  });
}

/**
 * JSON Schema for `response_format`. OpenAI's strict mode needs every property required and
 * no extra keys; a zod schema with optional fields is sent with `strict: false` instead.
 */
export function toStrictJsonSchema(schema: z.ZodType): {
  schema: Record<string, unknown>;
  strict: boolean;
} {
  const { $schema: _meta, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return { schema: rest, strict: allRequired(rest) };
}

function allRequired(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(allRequired);
  if (!node || typeof node !== "object") return true;
  const o = node as Record<string, unknown>;
  if (o.type === "object" && o.properties && typeof o.properties === "object") {
    const keys = Object.keys(o.properties);
    const required = new Set(Array.isArray(o.required) ? (o.required as string[]) : []);
    if (!keys.every((k) => required.has(k))) return false;
    if (o.additionalProperties !== false) return false;
  }
  return Object.values(o).every(allRequired);
}

/**
 * `reasoning_effort` only for models known to accept it (OpenAI o-series and GPT-5, gpt-oss),
 * also behind OpenRouter's `vendor/` prefix. Others reject or ignore it, so it is omitted.
 */
export function reasoningEffort(
  model: string,
  effort: LlmEffort,
): "low" | "medium" | "high" | null {
  const bare = model.toLowerCase().split("/").pop() ?? "";
  if (!/^(o\d|gpt-5|gpt-oss)/.test(bare)) return null;
  return effort === "low" ? "low" : effort === "medium" ? "medium" : "high";
}

/** OpenAI's newer models only take `max_completion_tokens`; other servers know `max_tokens`. */
function maxTokensParam(baseUrl: string | null, n: number) {
  return baseUrl && hostOf(baseUrl) === "api.openai.com"
    ? { max_completion_tokens: n }
    : { max_tokens: n };
}

/** Removes a reasoning model's <think> block from a full reply. */
function stripThinking(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, "");
}

/** The streaming version of stripThinking: holds back text inside a leading <think> block. */
class ThinkFilter {
  private buffer = "";
  private state: "start" | "thinking" | "text" = "start";

  push(delta: string): string {
    if (this.state === "text") return delta;
    this.buffer += delta;
    if (this.state === "start") {
      const trimmed = this.buffer.trimStart();
      if ("<think>".startsWith(trimmed) && trimmed.length < 7) return "";
      if (!trimmed.startsWith("<think>")) {
        this.state = "text";
        const out = this.buffer;
        this.buffer = "";
        return out;
      }
      this.state = "thinking";
    }
    const end = this.buffer.indexOf("</think>");
    if (end < 0) return "";
    const out = this.buffer.slice(end + "</think>".length).trimStart();
    this.buffer = "";
    this.state = "text";
    return out;
  }
}

function refused(detail: string | null | undefined): AppError {
  return appError("llm_refused", `The model declined this request.${detail ? ` ${detail}` : ""}`);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

type LocalServer = "ollama" | "lmstudio" | null;

function localServer(baseUrl: string): LocalServer {
  try {
    const u = new URL(baseUrl);
    const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(u.hostname);
    if (local && u.port === "11434") return "ollama";
    if (local && u.port === "1234") return "lmstudio";
  } catch {
    // fall through
  }
  return null;
}

/** Maps SDK errors to the app's codes with a sentence that says how to fix it. */
export function toOpenAiAppError(
  e: unknown,
  profile: Pick<OpenAiCompatibleProfile, "name" | "baseUrl">,
  model: string,
): AppError {
  const baseUrl = profile.baseUrl ?? "";
  const name = profile.name;
  const server = localServer(baseUrl);
  if (e instanceof OpenAI.APIUserAbortError || (e instanceof Error && e.name === "AbortError")) {
    return appError("llm_unavailable", "The request was cancelled.", e);
  }
  if (e instanceof OpenAI.APIConnectionTimeoutError) {
    return appError("llm_unavailable", `${name} at ${baseUrl} took too long to answer.`, e);
  }
  if (e instanceof OpenAI.APIConnectionError) {
    const msg =
      server === "ollama"
        ? `Ollama is not running at ${baseUrl}. Open the Ollama app or run \`ollama serve\`.`
        : server === "lmstudio"
          ? `LM Studio's server is not running at ${baseUrl}. Start it in LM Studio's Developer tab.`
          : `Could not reach ${name} at ${baseUrl}. Check the base URL and your connection.`;
    return appError("llm_unavailable", msg, e);
  }
  if (e instanceof OpenAI.AuthenticationError) {
    const envVar = envKeyVarFor({ kind: "openai-compatible", baseUrl });
    return appError(
      "llm_unavailable",
      `${name} rejected the API key. Save a new key in Settings${envVar ? ` or check ${envVar}` : ""}.`,
      e,
    );
  }
  if (e instanceof OpenAI.PermissionDeniedError) {
    return appError("llm_unavailable", `${name} does not allow this key to use "${model}".`, e);
  }
  if (e instanceof OpenAI.NotFoundError) {
    const msg =
      server === "ollama"
        ? `Ollama has no model "${model}". Run \`ollama pull ${model}\`, or pick another model in Settings.`
        : `${name} has no model "${model}" (or no chat endpoint at ${baseUrl}). Check the model id in Settings.`;
    return appError("llm_unavailable", msg, e);
  }
  if (e instanceof OpenAI.RateLimitError) {
    return appError(
      "llm_unavailable",
      `${name} rate limit or quota was reached. Try again in a minute.`,
      e,
    );
  }
  if (e instanceof OpenAI.BadRequestError) {
    return appError("llm_unavailable", `${name} rejected the request: ${e.message}`, e);
  }
  if (e instanceof OpenAI.APIError) {
    return appError("llm_unavailable", `${name} returned an error (${e.status ?? "unknown"}).`, e);
  }
  return appError("llm_unavailable", `The call to ${name} failed unexpectedly.`, e);
}

export interface ProbeResult {
  /** Model ids from `GET /models`, sorted. */
  models: string[];
  /** The model the structured-output probe used, if any. */
  model: string | null;
  /** Whether the server honoured `response_format: json_schema`. */
  jsonSchema: boolean;
  /** Why the probe could not tell, when it could not. */
  note: string | null;
}

const probeSchema = z.object({ answer: z.number().int() });

/**
 * "Test connection" in Settings: lists the models, then asks the chosen (or first) model for a
 * tiny `json_schema` reply. A 400 or an unusable reply means JSON mode will be used instead.
 */
export async function probeOpenAiCompatible(input: {
  name: string;
  baseUrl: string;
  apiKey?: string | undefined;
  model?: string | undefined;
  fetch?: Fetch;
}): Promise<Result<ProbeResult>> {
  const client = openAiClient(input.baseUrl, input.apiKey, input.fetch, 0);
  const profile = { name: input.name, baseUrl: input.baseUrl };
  let models: string[];
  try {
    const page = await client.models.list();
    models = page.data.map((m) => m.id).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    return err(toOpenAiAppError(e, profile, input.model ?? ""));
  }
  const model = input.model?.trim() || models[0];
  if (!model) {
    const hint =
      localServer(input.baseUrl) === "ollama" ? " Run `ollama pull llama3.2` and test again." : "";
    return ok({ models, model: null, jsonSchema: false, note: `No models are installed.${hint}` });
  }
  const { schema } = toStrictJsonSchema(probeSchema);
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Reply with JSON only." },
        { role: "user", content: "What is 2 + 3? Put the number in `answer`." },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "probe", strict: true, schema },
      },
    });
    const parsed = parseJsonLoose(res.choices[0]?.message.content ?? "");
    const valid = parsed.ok && probeSchema.safeParse(parsed.value).success;
    return ok({
      models,
      model,
      jsonSchema: valid,
      note: valid ? null : "The model ignored the JSON schema, so Thoth will use JSON mode.",
    });
  } catch (e) {
    if (e instanceof OpenAI.BadRequestError) {
      return ok({
        models,
        model,
        jsonSchema: false,
        note: "This server does not take a JSON schema, so Thoth will use JSON mode.",
      });
    }
    const mapped = toOpenAiAppError(e, profile, model);
    return ok({ models, model, jsonSchema: false, note: mapped.message });
  }
}
