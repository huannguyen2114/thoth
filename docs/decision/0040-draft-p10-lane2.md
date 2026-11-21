# ADR-0040 (draft, Phase 10 Lane 2): A per-task router behind `container.llm()`, and how structured output degrades

- Status: Proposed
- Date: 2026-11-21
- Refines: ADR-0037

The orchestrator renumbers this draft at merge.

## Context

ADR-0037 routes each task to its own profile and model. Every use case already calls `deps.llm()` and puts `task` on each request. Changing every call site to pass a task would touch most lanes' files.

OpenAI-compatible servers differ in how much structured output they support: OpenAI and recent Ollama take `json_schema`; some servers only take `json_object`; some take neither.

## Decision

1. **A router, not a new call shape.** `container.llm()` returns `RoutedLlmProvider` (`LlmProvider.id` gains `"routed"`), which dispatches each request on `request.task` to a lazily built adapter for that route. `container.llm(task)` returns the concrete adapter. No use case changes.
2. **Keys.** The keychain service is `"Thoth"`; the account is the profile's `keyRef` (`anthropic-api` for the built-in, `profile-<id>` for others). Env vars win, and each is only ever sent to its own host (`api.openai.com`, `openrouter.ai`). The OpenAI SDK is always given an explicit key, organization and project so it never reads `OPENAI_*` env for another host.
3. **Structured output ladder.** `json_schema` (when `caps.jsonSchema`) → `json_object` with the schema in the prompt → prompt only, stepping down on a 400. `strict: true` is sent only when every object property is required, since OpenAI's strict mode rejects optional properties. Whatever the mode, the reply goes through a lenient JSON reader (`<think>` blocks, fences, trailing commas) and zod, with one corrective retry.
4. **Built-in profiles are code, not data.** `readLlmSettings` always replaces the stored built-ins with the current ones, so their model lists follow new Claude releases.

## Consequences

- Swapping the router for explicit task arguments later is a local change in the container and `packages/llm`.
- A schema with optional fields gets non-strict `json_schema` on OpenAI, so zod remains the real check.
- Built-in profiles cannot be renamed or edited by the owner.
