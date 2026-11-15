import type { z } from "zod";
import type { Result } from "../shared/result";

/**
 * The only way the app talks to a language model. Adapters live in @thoth/llm.
 * See docs/technical_design/02-llm-providers.md.
 */
export type LlmTask = "chat" | "chapters" | "summary" | "quiz" | "flashcards" | "grading";

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
  maxTokens?: number;
  signal?: AbortSignal;
}

export type LlmStreamEvent =
  | { type: "text"; delta: string }
  | { type: "done"; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; message: string };

export interface LlmProvider {
  readonly id: "anthropic-api" | "claude-subscription" | "fake";
  generateText(req: LlmRequest): Promise<Result<string>>;
  streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent>;
  generateObject<S extends z.ZodType>(req: LlmRequest, schema: S): Promise<Result<z.infer<S>>>;
}
