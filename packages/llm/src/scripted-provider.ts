import { FakeLlmProvider } from "./fake-provider";

/**
 * STUB from Step 0 (ADR-0028). Owned by Phase 9 Lane 1: deterministic, schema-valid replies
 * per task for the end-to-end tests. Selected by THOTH_LLM=scripted; never shown in the UI.
 */
export class ScriptedLlmProvider extends FakeLlmProvider {}
