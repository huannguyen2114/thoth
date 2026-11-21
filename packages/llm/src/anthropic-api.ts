import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  type AppError,
  appError,
  defaultEffortByTask,
  err,
  type LlmProvider,
  type LlmRequest,
  type LlmStreamEvent,
  type LlmTask,
  ok,
  type Result,
} from "@thoth/core";
import type { z } from "zod";

type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

export interface AnthropicApiOptions {
  /** Omit to let the SDK resolve ANTHROPIC_API_KEY / an `ant auth` profile. */
  apiKey?: string | undefined;
  models: Record<LlmTask, string>;
  /** Injected in tests. */
  client?: Anthropic;
}

/** Models that support server-side refusal fallbacks (ADR-0013). */
const FALLBACK_MODELS: ReadonlySet<string> = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

/** Uses the owner's Anthropic API key. See docs/technical_design/02-llm-providers.md. */
export class AnthropicApiProvider implements LlmProvider {
  readonly id = "anthropic-api" as const;
  private readonly client: Anthropic;

  constructor(private readonly opts: AnthropicApiOptions) {
    this.client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  }

  /** Builds the shared request body: system + cached source context + effort + fallbacks. */
  private params(req: LlmRequest, defaultMax: number) {
    const model = this.opts.models[req.task];
    const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
      { type: "text", text: req.system },
    ];
    if (req.context) {
      system.push({
        type: "text",
        text: `<source>\n${req.context}\n</source>`,
        cache_control: { type: "ephemeral" },
      });
    }
    const fallback = FALLBACK_MODELS.has(model);
    return {
      model,
      max_tokens: req.maxTokens ?? defaultMax,
      system,
      messages: req.messages,
      output_config: { effort: req.effort ?? defaultEffortByTask[req.task] },
      ...(fallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    } satisfies BetaParams;
  }

  async generateText(req: LlmRequest): Promise<Result<string>> {
    try {
      const msg = await this.client.beta.messages
        .stream(this.params(req, 16000), { signal: req.signal })
        .finalMessage();
      if (msg.stop_reason === "refusal") return err(refused(msg.stop_details));
      return ok(textOf(msg.content));
    } catch (e) {
      return err(toAppError(e));
    }
  }

  async *streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    try {
      const stream = this.client.beta.messages.stream(this.params(req, 64000), {
        signal: req.signal,
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", delta: event.delta.text };
        }
      }
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") {
        yield { type: "error", message: refused(msg.stop_details).message };
        return;
      }
      yield {
        type: "done",
        usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
      };
    } catch (e) {
      yield { type: "error", message: toAppError(e).message };
    }
  }

  async generateObject<S extends z.ZodType>(
    req: LlmRequest,
    schema: S,
  ): Promise<Result<z.infer<S>>> {
    try {
      const base = this.params(req, 16000);
      const msg = await this.client.beta.messages.parse(
        {
          ...base,
          output_config: { ...base.output_config, format: betaZodOutputFormat(schema) },
        },
        { signal: req.signal },
      );
      if (msg.stop_reason === "refusal") return err(refused(msg.stop_details));
      if (msg.parsed_output == null) {
        return err(appError("llm_bad_output", "The model reply did not match the expected shape."));
      }
      return ok(msg.parsed_output as z.infer<S>);
    } catch (e) {
      return err(toAppError(e));
    }
  }
}

function textOf(content: Anthropic.Beta.Messages.BetaContentBlock[]): string {
  return content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

function refused(details: { explanation?: string | null } | null | undefined): AppError {
  return appError(
    "llm_refused",
    `The model declined this request.${details?.explanation ? ` ${details.explanation}` : ""}`,
  );
}

/** Maps SDK errors, most specific first. Never string-match messages. */
export function toAppError(e: unknown): AppError {
  if (e instanceof Anthropic.AuthenticationError) {
    return appError("llm_unavailable", "The API key was rejected. Check ANTHROPIC_API_KEY.", e);
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return appError("llm_unavailable", "This API key cannot use the chosen model.", e);
  }
  if (e instanceof Anthropic.RateLimitError) {
    return appError("llm_unavailable", "The API rate limit was reached. Try again in a minute.", e);
  }
  if (e instanceof Anthropic.BadRequestError) {
    return appError("llm_unavailable", `The API rejected the request: ${e.message}`, e);
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return appError(
      "llm_unavailable",
      "Could not reach the Anthropic API. Check your connection.",
      e,
    );
  }
  if (e instanceof Anthropic.APIError) {
    return appError("llm_unavailable", `The Anthropic API returned an error (${e.status}).`, e);
  }
  if (e instanceof Error && e.name === "AbortError") {
    return appError("llm_unavailable", "The request was cancelled.", e);
  }
  if (e instanceof Error && /api key|apiKey|authentication/i.test(e.message)) {
    return appError(
      "llm_unavailable",
      "No API key found. Set ANTHROPIC_API_KEY in apps/web/.env.local.",
      e,
    );
  }
  return appError("llm_unavailable", "The model call failed unexpectedly.", e);
}
