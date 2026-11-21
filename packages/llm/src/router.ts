import type {
  LlmProfile,
  LlmProvider,
  LlmRequest,
  LlmSettingsV2,
  LlmStreamEvent,
  LlmTask,
  Result,
} from "@thoth/core";
import { llmTasks } from "@thoth/core";
import type { z } from "zod";
import { AnthropicApiProvider } from "./anthropic-api";
import { ClaudeSubscriptionProvider } from "./claude-subscription";
import { OpenAiCompatibleProvider } from "./openai-compatible";

export interface RouterDeps {
  /** The key for a profile: environment first, then the keychain (doc 20). */
  resolveKey(profile: LlmProfile): Promise<string | undefined>;
  /** Injected in tests: builds the adapter for one profile and model. */
  build?: (profile: LlmProfile, model: string, apiKey: string | undefined) => LlmProvider;
}

/**
 * The provider the container hands out (doc 20). Callers keep calling `llm()` and put the
 * task on each request; this dispatches every request to the adapter for that task's route.
 * Adapters are built lazily, once per profile and model, so an unused provider costs nothing.
 */
export class RoutedLlmProvider implements LlmProvider {
  readonly id = "routed" as const;
  private readonly cache = new Map<string, Promise<LlmProvider>>();

  constructor(
    private readonly settings: LlmSettingsV2,
    private readonly deps: RouterDeps,
  ) {}

  /** The concrete adapter for one task. */
  forTask(task: LlmTask): Promise<LlmProvider> {
    const route = this.settings.tasks[task];
    const key = `${route.profileId}\u0000${route.model}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.make(route.profileId, route.model);
      this.cache.set(key, p);
    }
    return p;
  }

  private async make(profileId: string, model: string): Promise<LlmProvider> {
    // The settings schema guarantees every route names a saved profile.
    const profile = this.settings.profiles.find((x) => x.id === profileId) as LlmProfile;
    const apiKey = await this.deps.resolveKey(profile);
    return (this.deps.build ?? buildAdapter)(profile, model, apiKey);
  }

  async generateText(req: LlmRequest): Promise<Result<string>> {
    return (await this.forTask(req.task)).generateText(req);
  }

  async *streamText(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    yield* (await this.forTask(req.task)).streamText(req);
  }

  async generateObject<S extends z.ZodType>(
    req: LlmRequest,
    schema: S,
  ): Promise<Result<z.infer<S>>> {
    return (await this.forTask(req.task)).generateObject(req, schema);
  }
}

/** One adapter for one profile and model. Every task maps to that model. */
export function buildAdapter(
  profile: LlmProfile,
  model: string,
  apiKey: string | undefined,
): LlmProvider {
  const models = Object.fromEntries(llmTasks.map((t) => [t, model])) as Record<LlmTask, string>;
  switch (profile.kind) {
    case "anthropic-api":
      return new AnthropicApiProvider({ models, apiKey });
    case "claude-subscription":
      return new ClaudeSubscriptionProvider({ models });
    case "openai-compatible":
      return new OpenAiCompatibleProvider({ profile, models, apiKey });
  }
}
