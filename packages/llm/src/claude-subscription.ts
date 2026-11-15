import type { query as agentQuery, Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  appError,
  defaultEffortByTask,
  err,
  type LlmModel,
  type LlmProvider,
  type LlmRequest,
  type LlmStreamEvent,
  type LlmTask,
  ok,
  type Result,
} from "@thoth/core";
import { z } from "zod";

type QueryFn = typeof agentQuery;

export interface ClaudeSubscriptionOptions {
  models: Record<LlmTask, LlmModel>;
  /** Injected in tests. Defaults to the Agent SDK's query(). */
  query?: QueryFn;
}

/**
 * Uses the owner's Claude subscription through headless Claude Code (Agent SDK).
 * Isolated per ADR-0013: no tools, no filesystem settings, no saved session,
 * and no ANTHROPIC_API_KEY, so it never bills the API.
 */
export class ClaudeSubscriptionProvider implements LlmProvider {
  readonly id = "claude-subscription" as const;

  constructor(private readonly opts: ClaudeSubscriptionOptions) {}

  private async q(): Promise<QueryFn> {
    // Lazy import: the SDK spawns a CLI and is heavy; only load when used.
    return this.opts.query ?? (await import("@anthropic-ai/claude-agent-sdk")).query;
  }

  private options(req: LlmRequest, extra: Partial<Options> = {}): Options {
    const { ANTHROPIC_API_KEY: _drop, ...env } = process.env;
    const abortController = new AbortController();
    req.signal?.addEventListener("abort", () => abortController.abort(), { once: true });
    return {
      model: this.opts.models[req.task],
      effort: req.effort ?? defaultEffortByTask[req.task],
      systemPrompt: req.context
        ? `${req.system}\n\n<source>\n${req.context}\n</source>`
        : req.system,
      tools: [],
      strictMcpConfig: true,
      settingSources: [],
      persistSession: false,
      maxTurns: 1,
      env: { ...env, CLAUDE_AGENT_SDK_CLIENT_APP: "thoth/0.1" },
      abortController,
      ...extra,
    };
  }

  async generateText(req: LlmRequest): Promise<Result<string>> {
    const run = (await this.q())({ prompt: toPrompt(req), options: this.options(req) });
    try {
      for await (const m of run) {
        if (m.type === "result") return resultText(m);
      }
      return err(appError("llm_unavailable", "Claude Code ended without a result."));
    } catch (e) {
      return err(toAppError(e));
    }
  }

  async *streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const run = (await this.q())({
      prompt: toPrompt(req),
      options: this.options(req, { includePartialMessages: true }),
    });
    try {
      for await (const m of run) {
        if (
          m.type === "stream_event" &&
          m.event.type === "content_block_delta" &&
          m.event.delta.type === "text_delta"
        ) {
          yield { type: "text", delta: m.event.delta.text };
        } else if (m.type === "result") {
          const r = resultText(m);
          if (!r.ok) {
            yield { type: "error", message: r.error.message };
            return;
          }
          yield {
            type: "done",
            usage: { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens },
          };
          return;
        }
      }
    } catch (e) {
      yield { type: "error", message: toAppError(e).message };
    }
  }

  async generateObject<S extends z.ZodType>(
    req: LlmRequest,
    schema: S,
  ): Promise<Result<z.infer<S>>> {
    const run = (await this.q())({
      prompt: toPrompt(req),
      options: this.options(req, {
        outputFormat: { type: "json_schema", schema: toCliJsonSchema(schema) },
        // Structured output is delivered through an internal turn.
        maxTurns: 3,
      }),
    });
    try {
      for await (const m of run) {
        if (m.type !== "result") continue;
        if (m.subtype === "error_max_structured_output_retries") {
          return err(
            appError("llm_bad_output", "The model reply did not match the expected shape."),
          );
        }
        if (m.subtype !== "success" || m.is_error) return resultText(m) as Result<never>;
        const parsed = schema.safeParse(m.structured_output);
        return parsed.success
          ? ok(parsed.data as z.infer<S>)
          : err(appError("llm_bad_output", parsed.error.message));
      }
      return err(appError("llm_unavailable", "Claude Code ended without a result."));
    } catch (e) {
      return err(toAppError(e));
    }
  }
}

type ResultMessage = Extract<SDKMessage, { type: "result" }>;

function resultText(m: ResultMessage): Result<string> {
  if (m.subtype === "success" && !m.is_error) {
    if (m.stop_reason === "refusal") {
      return err(appError("llm_refused", "The model declined this request."));
    }
    return ok(m.result);
  }
  // An API failure arrives as subtype "success" with is_error; its text is in `result`.
  const detail =
    m.subtype === "success" ? m.result : m.errors.length > 0 ? m.errors.join(" ") : m.subtype;
  const authProblem =
    (m.subtype === "success" && m.api_error_status === 401) ||
    /authenticat|oauth|log ?in/i.test(detail);
  const hint = authProblem ? " Run `claude` in a terminal and sign in with /login." : "";
  return err(appError("llm_unavailable", `Claude Code: ${detail}.${hint}`));
}

/** The Agent SDK takes one prompt string: render earlier turns as a transcript. */
export function toPrompt(req: LlmRequest): string {
  if (req.messages.length === 1 && req.messages[0]?.role === "user") return req.messages[0].content;
  const turns = req.messages.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`).join("\n");
  return `${turns}\n\nReply as the assistant to the last user turn.`;
}

/**
 * The CLI's validator does not know the draft 2020-12 meta-schema that zod emits as `$schema`,
 * so drop that key. The schema body itself is unchanged.
 */
export function toCliJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _meta, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

function toAppError(e: unknown) {
  if (e instanceof Error && e.name === "AbortError") {
    return appError("llm_unavailable", "The request was cancelled.", e);
  }
  // Keep the CLI's own words (first line): they say what actually went wrong.
  const detail = e instanceof Error ? e.message.split("\n")[0]?.slice(0, 300) : undefined;
  return appError(
    "llm_unavailable",
    `Could not run Claude Code${detail ? `: ${detail}` : ""}. Check that it is installed and signed in (\`claude\`).`,
    e,
  );
}
