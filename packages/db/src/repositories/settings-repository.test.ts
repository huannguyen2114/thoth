import { fileURLToPath } from "node:url";
import { defaultLlmSettings } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { createDb, migrateDb } from "../client";
import { DrizzleSettingsRepository } from "./settings-repository";

describe("DrizzleSettingsRepository", () => {
  it("returns null, then upserts LLM settings", async () => {
    const db = createDb(":memory:");
    await migrateDb(db, fileURLToPath(new URL("../../drizzle", import.meta.url)));
    const repo = new DrizzleSettingsRepository(db);

    expect(await repo.getLlmSettings()).toBeNull();
    await repo.saveLlmSettings(defaultLlmSettings);
    const next = { ...defaultLlmSettings, provider: "anthropic-api" as const };
    await repo.saveLlmSettings(next);
    expect(await repo.getLlmSettings()).toEqual(next);
  });
});
