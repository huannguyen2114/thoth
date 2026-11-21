# 20. OpenAI-compatible providers and per-task routing

Status: Stub (Phase 10 Step 0). Lane 2 fills it in and updates doc 02. Decision: ADR-0037.

## Contracts already in place (Step 0)

- `packages/core/src/domain/llm-profiles.ts`: `LlmProfile`, `LlmSettingsV2` (profiles plus a `{ profileId, model }` route per task), `readLlmSettings` (reads v1 or v2), `upgradeLlmSettings`, `builtInProfiles`, `defaultLlmSettingsV2`.
- `packages/core/src/ports/secrets.ts`: the `SecretStore` port (OS keychain in the web app).
- Env overrides documented in `apps/web/.env.example`: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`.
