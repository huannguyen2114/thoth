# ADR-0037: OpenAI-compatible providers, per-task profiles and keys in the OS keychain

- Status: Accepted
- Date: 2026-11-21
- Amends: ADR-0008, ADR-0013

## Context

Until now Thoth used Claude only, through the API key or the subscription, with one provider for every task (ADR-0008). The owner wants to use more providers:

- local models through Ollama or LM Studio;
- OpenRouter;
- OpenAI;
- any OpenAI-compatible base URL;
- and a different provider per task, for example chat on Claude and flashcards on a local model.

API keys have so far lived only in `apps/web/.env.local`. That is awkward in a desktop app, and unworkable with several keys.

## Decision

1. **A third adapter.** `OpenAiCompatibleProvider` in `@thoth/llm` implements the same `LlmProvider` port on the OpenAI chat-completions API with a configurable base URL. Use cases do not change.
2. **Profiles.** LLM settings v2 (`packages/core/src/domain/llm-profiles.ts`) have:
   - a list of saved **profiles**, each with a kind, name, base URL, key reference, model ids and capabilities;
   - a **profile plus model per task**.

   The two Claude profiles are built in. A stored v1 value upgrades on read (`readLlmSettings`), so existing installs keep their choices.
3. **Structured output degrades safely.** A profile's `caps.jsonSchema` is found by "Test connection":
   - **true:** the adapter asks for `response_format: json_schema`;
   - **false:** it asks for JSON mode with the schema in the prompt.

   Either way zod validates the reply, it runs through the existing JSON repair, and it is retried once, so a weak local model fails with `llm_bad_output`, not a crash.
4. **Keys go in the OS keychain.** A `SecretStore` port (`packages/core/src/ports/secrets.ts`) is implemented in the web app on the OS keychain: macOS Keychain, Windows Credential Manager, or Linux Secret Service. A key is typed into Settings once and never stored in the database, a file or the browser; the UI only shows that one is saved.
   - **Environment variables still win:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `OPENROUTER_API_KEY`, for development, CI, and Linux machines without a keychain.
   - **Unchanged:** the subscription adapter still strips `ANTHROPIC_API_KEY`.
5. **Embeddings stay local** (ADR-0029). Only text generation is routed.

## Consequences

- Settings becomes a profiles editor plus a per-task routing table.
- Prompt caching is guaranteed only on the Anthropic profiles. Other providers get the source as a plain system message.
- Quiz and grading quality on small local models will be lower; Settings says so next to the routing table.
- A Linux machine without Secret Service cannot save keys in the UI and must use the environment.
