# ADR-0008: One LLM port with two adapters: API key and Claude subscription

- Status: Accepted; structured-output mechanism superseded by ADR-0013
- Date: 2026-11-15

## Context

The owner wants either their **Anthropic API key** or their **Claude subscription**. The subscription is reached by running headless Claude Code through `@anthropic-ai/claude-agent-sdk`. The two have different capabilities. The API supports native tool-use for structured output and prompt caching. The Agent SDK spawns a CLI process and returns text.

## Decision

- **One port, `LlmProvider`** (`packages/core/src/ports/llm.ts`), with `generateText`, `streamText` and `generateObject(schema)`. Requests carry a `task` (chat, quiz, and so on), so model choice is per task.
- **Adapters in `@thoth/llm`:**
  - `anthropic-api` uses `@anthropic-ai/sdk`. It uses tool-use and JSON schema for `generateObject`, and prompt caching on the `context` (source text).
  - `claude-subscription` uses the Agent SDK `query()`. All tools are disabled and `maxTurns: 1`. For `generateObject` it asks for JSON, validates with zod, and retries once on failure.
  - `fake` is deterministic and used for tests and offline UI work. It exists now.
- **Provider and model per task** are user settings, stored in the `settings` table. The API key stays in the environment (`ANTHROPIC_API_KEY`) and is never stored in the database or sent to the client.
- A **parity test** runs the same structured request through both real adapters and requires schema-valid output from each.

## Consequences

- **Feature code never knows which provider is active.**
- **The subscription adapter is slower to start.** It spawns a process, so the UI streams and shows progress.
- Malformed JSON is an expected `llm_bad_output` error (ADR-0005), not a crash.

## Alternatives considered

- Only the API key. Simpler, but ignores the owner's main requirement.
- The Vercel AI SDK as the abstraction. Good for HTTP providers, but it has no adapter for the Claude Agent SDK. Our port is small enough to own.
