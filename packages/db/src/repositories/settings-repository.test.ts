import { fileURLToPath } from "node:url";
import { defaultLlmSettingsV2, llmTasks } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { createDb, migrateDb } from "../client";
import { settings } from "../schema";
import { DrizzleSettingsRepository } from "./settings-repository";

async function freshRepo() {
  const db = createDb(":memory:");
  await migrateDb(db, fileURLToPath(new URL("../../drizzle", import.meta.url)));
  return { db, repo: new DrizzleSettingsRepository(db) };
}

describe("DrizzleSettingsRepository", () => {
  it("returns null, then upserts LLM settings v2", async () => {
    const { repo } = await freshRepo();
    expect(await repo.getLlmSettings()).toBeNull();
    await repo.saveLlmSettings(defaultLlmSettingsV2);
    const next = {
      ...defaultLlmSettingsV2,
      tasks: {
        ...defaultLlmSettingsV2.tasks,
        chat: { profileId: "anthropic-api", model: "claude-sonnet-5-5" },
      },
    };
    await repo.saveLlmSettings(next);
    expect(await repo.getLlmSettings()).toEqual(next);
  });

  it("upgrades a stored v1 row on read, then saves it as v2", async () => {
    const { db, repo } = await freshRepo();
    const v1 = {
      provider: "anthropic-api",
      models: {
        ...Object.fromEntries(llmTasks.map((t) => [t, "claude-opus-5-5"])),
        quiz: "claude-sonnet-5-5",
      },
    };
    await db.insert(settings).values({ key: "llm", value: v1 });

    const read = await repo.getLlmSettings();
    expect(read?.version).toBe(2);
    expect(read?.tasks.quiz).toEqual({ profileId: "anthropic-api", model: "claude-sonnet-5-5" });
    expect(read?.tasks.chat.profileId).toBe("anthropic-api");
    if (!read) throw new Error("missing");

    await repo.saveLlmSettings(read);
    const row = await db.query.settings.findFirst();
    expect((row?.value as { version?: number } | undefined)?.version).toBe(2);
  });

  it("ignores a stored value it cannot read", async () => {
    const { db, repo } = await freshRepo();
    await db.insert(settings).values({ key: "llm", value: { provider: "gpt" } });
    expect(await repo.getLlmSettings()).toBeNull();
  });
});
