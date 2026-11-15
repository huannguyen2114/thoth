# ADR-0013: LLM adapter defaults, structured output and subscription isolation

- Status: Accepted
- Date: 2026-11-15
- Supersedes: ADR-0008 (only its structured-output mechanism for both adapters; the rest of ADR-0008 stands)

## Context

Phase 1 builds the two real adapters from ADR-0008. Reading the current SDKs showed better options than ADR-0008 assumed:

- **Anthropic SDK 1.8:** structured output is native through `output_config.format`, and `client.beta.messages.parse()` with `betaZodOutputFormat()` validates against a zod schema. Tool-use is no longer needed for JSON.
- **Claude Agent SDK 0.3:** `query()` accepts `outputFormat: { type: "json_schema", schema }` and returns `structured_output`. A "prompt for JSON and repair it" loop is no longer needed.
- **Defaults:** current guidance is to default to `claude-opus-5-5`, to set `effort` explicitly (Opus 5.5 defaults to `medium`), and to enable server-side refusal fallbacks on Opus and Sonnet 5.5.
- **Isolation:** the Agent SDK runs the user's Claude Code. Without isolation it would load the owner's `~/.claude` settings, CLAUDE.md files, MCP servers and tools. It would also bill the API instead of the subscription whenever `ANTHROPIC_API_KEY` is set.

## Decision

1. **Models.**
   - The default model for every task is `claude-opus-5-5`.
   - Settings offer `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`, chosen per task (`chat`, `chapters`, `summary`, `quiz`, `flashcards`, `grading`).
   - The owner may change any of them.
2. **Effort.** Each task has a default effort in core (`defaultEffortByTask`) and is sent explicitly. A use case may override it per request.
3. **Structured output.**
   - The `anthropic-api` adapter uses `beta.messages.parse` with `betaZodOutputFormat(schema)`.
   - The `claude-subscription` adapter passes `z.toJSONSchema(schema)` as `outputFormat` and validates `structured_output` with the same zod schema.
   - A schema failure is `llm_bad_output`.
4. **Refusals.**
   - For Opus 5.5 and Sonnet 5.5, the `anthropic-api` adapter sends `betas: ["server-side-fallback-2026-07-01"]` with `fallbacks: "default"`.
   - A final `stop_reason: "refusal"` becomes the new `AppError` code `llm_refused`.
5. **Subscription isolation.** The `claude-subscription` adapter always passes:
   - `tools: []` and `strictMcpConfig: true`;
   - `settingSources: []`, so no user or project settings and no CLAUDE.md;
   - `persistSession: false`;
   - `env` = `process.env` **without** `ANTHROPIC_API_KEY`, so the call always uses the logged-in subscription.
6. **Source text placement.**
   - The `anthropic-api` adapter puts `LlmRequest.context` in a second system block with `cache_control`.
   - The subscription adapter appends it to the system prompt.
7. **Streaming.** Text streams through `beta.messages.stream` and through Agent SDK `stream_event` partial messages.

## Consequences

- Both adapters share one zod schema per output, with no hand-written JSON repair.
- Opus 5.5 by default is the highest quality and costs more on the API key. The owner can switch tasks to Sonnet or Haiku in Settings.
- The subscription adapter cannot see the owner's Claude Code customisations. That is intended, because Thoth prompts must be reproducible.
