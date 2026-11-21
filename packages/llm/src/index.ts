import type { LlmSettingsV2 } from "@thoth/core";
import { RoutedLlmProvider, type RouterDeps } from "./router";

export { AnthropicApiProvider } from "./anthropic-api";
export { ClaudeSubscriptionProvider } from "./claude-subscription";
export { FakeLlmProvider } from "./fake-provider";
export {
  OpenAiCompatibleProvider,
  type ProbeResult,
  probeOpenAiCompatible,
} from "./openai-compatible";
export { buildAdapter, RoutedLlmProvider, type RouterDeps } from "./router";
export { ScriptedLlmProvider } from "./scripted-provider";

/**
 * Builds the provider for the saved settings: a router that sends each request to its task's
 * profile and model (doc 20). Called only by the composition root.
 */
export function createLlmProvider(settings: LlmSettingsV2, deps: RouterDeps): RoutedLlmProvider {
  return new RoutedLlmProvider(settings, deps);
}
