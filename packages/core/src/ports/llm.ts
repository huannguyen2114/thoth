import type { z } from "zod";
import type { LlmEffort, LlmProviderId, LlmTask } from "../domain/llm-settings";
import type { Result } from "../shared/result";

/**
 * The only way the app talks to a language model. Adapters live in @thoth/llm.
 * See docs/technical_design/02-llm-providers.md.
 */
export type { LlmTask };

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  task: LlmTask;
  system: string;
  /** Large, stable context (source text). Adapters may cache it. */
  context?: string;
  messages: LlmMessage[];
  /** Defaults to defaultEffortByTask[task]. */
  effort?: LlmEffort;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type LlmStreamEvent =
  | { type: "text"; delta: string }
  | { type: "done"; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; message: string };

export interface LlmProvider {
  /** The adapter kind. "routed" is the per-task dispatcher the container hands out (doc 20). */
  readonly id: LlmProviderId | "routed" | "fake";
  generateText(req: LlmRequest): Promise<Result<string>>;
  streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent>;
  generateObject<S extends z.ZodType>(req: LlmRequest, schema: S): Promise<Result<z.infer<S>>>;
}
