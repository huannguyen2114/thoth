import type { LlmProvider, LlmRequest, LlmStreamEvent } from "@thoth/core";
import { appError, err, ok } from "@thoth/core";
import type { z } from "zod";

/**
 * Deterministic provider for tests and offline UI work.
 * Real adapters (anthropic-api, claude-subscription) arrive in Phase 1.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly id = "fake" as const;
  constructor(
    private readonly reply: (req: LlmRequest) => string = () => "This is a fake reply.",
  ) {}

  async generateText(req: LlmRequest) {
    return ok(this.reply(req));
  }

  async *streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    for (const word of this.reply(req).split(/(?<= )/)) yield { type: "text", delta: word };
    yield { type: "done" };
  }

  async generateObject<S extends z.ZodType>(req: LlmRequest, schema: S) {
    let raw: unknown;
    try {
      raw = JSON.parse(this.reply(req));
    } catch (e) {
      return err(appError("llm_bad_output", "Reply was not JSON.", e));
    }
    const parsed = schema.safeParse(raw);
    return parsed.success
      ? ok(parsed.data as z.infer<S>)
      : err(appError("llm_bad_output", parsed.error.message));
  }
}
