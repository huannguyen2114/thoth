import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
};

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ...timestamps,
});

export const contents = sqliteTable("contents", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").references(() => spaces.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["pdf", "youtube", "webpage", "text"] }).notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  filePath: text("file_path"),
  status: text("status", { enum: ["pending", "processing", "ready", "failed"] })
    .notNull()
    .default("pending"),
  error: text("error"),
  ...timestamps,
});

/** Key-value app settings (provider choice, model per task). Secrets stay in env, not here. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: timestamps.updatedAt,
});
