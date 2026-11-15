import { type LlmSettings, llmSettingsSchema, type SettingsRepository } from "@thoth/core";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { settings } from "../schema";

const LLM_KEY = "llm";

export class DrizzleSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Db) {}

  async getLlmSettings(): Promise<LlmSettings | null> {
    const row = await this.db.query.settings.findFirst({ where: eq(settings.key, LLM_KEY) });
    if (!row) return null;
    // Stored JSON may predate a schema change: ignore it rather than crash.
    const parsed = llmSettingsSchema.safeParse(row.value);
    return parsed.success ? parsed.data : null;
  }

  async saveLlmSettings(value: LlmSettings): Promise<void> {
    await this.db
      .insert(settings)
      .values({ key: LLM_KEY, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: sql`(unixepoch('subsec') * 1000)` },
      });
  }
}
