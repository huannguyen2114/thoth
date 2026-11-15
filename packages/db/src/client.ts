import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/** url examples: "file:./data/thoth.db", ":memory:" */
export function createDb(url: string) {
  if (url.startsWith("file:")) mkdirSync(dirname(url.slice(5)), { recursive: true });
  const client = createClient({ url });
  return drizzle(client, { schema });
}

/**
 * Prepares the database: turns on foreign keys (SQLite leaves them off, so ON DELETE CASCADE
 * would silently do nothing) and applies pending migrations from `migrationsFolder`
 * (packages/db/drizzle). The caller passes the path: bundlers rewrite import.meta.url.
 */
export async function migrateDb(db: Db, migrationsFolder: string) {
  await db.run("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder });
}
