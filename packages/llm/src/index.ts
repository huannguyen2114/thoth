import type { LlmProvider, LlmSettings } from "@thoth/core";
import { AnthropicApiProvider } from "./anthropic-api";
import { ClaudeSubscriptionProvider } from "./claude-subscription";

export { AnthropicApiProvider } from "./anthropic-api";
export { ClaudeSubscriptionProvider } from "./claude-subscription";
export { FakeLlmProvider } from "./fake-provider";

export interface ProviderEnv {
  anthropicApiKey?: string | undefined;
}

/** Builds the provider the owner selected in Settings. Called by the composition root. */
export function createLlmProvider(settings: LlmSettings, env: ProviderEnv = {}): LlmProvider {
  switch (settings.provider) {
    case "anthropic-api":
      return new AnthropicApiProvider({ models: settings.models, apiKey: env.anthropicApiKey });
    case "claude-subscription":
      return new ClaudeSubscriptionProvider({ models: settings.models });
  }
}
