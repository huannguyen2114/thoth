import { type LlmSettingsV2, readLlmSettings, type SettingsRepository } from "@thoth/core";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { settings } from "../schema";

const LLM_KEY = "llm";

export class DrizzleSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Db) {}

  /** Reads v1 or v2 (doc 20). A v1 row is upgraded in memory and rewritten on the next save. */
  async getLlmSettings(): Promise<LlmSettingsV2 | null> {
    const row = await this.db.query.settings.findFirst({ where: eq(settings.key, LLM_KEY) });
    if (!row) return null;
    // Stored JSON may predate a schema change: ignore it rather than crash.
    return readLlmSettings(row.value);
  }

  async saveLlmSettings(value: LlmSettingsV2): Promise<void> {
    await this.db
      .insert(settings)
      .values({ key: LLM_KEY, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: sql`(unixepoch('subsec') * 1000)` },
      });
  }
}
