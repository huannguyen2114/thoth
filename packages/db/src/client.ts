import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
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
 * Prepares the database: applies pending migrations from `migrationsFolder` (packages/db/drizzle),
 * then turns on foreign keys (SQLite leaves them off, so ON DELETE CASCADE would silently do
 * nothing). The caller passes the path: bundlers rewrite import.meta.url.
 *
 * Foreign keys stay OFF while migrating. The migrator runs each migration in a transaction, where
 * `PRAGMA foreign_keys` is a no-op, so a table rebuild (`DROP TABLE chats`) would otherwise
 * cascade-delete its children (`chat_messages`). `foreign_key_check` afterwards catches a
 * migration that left dangling rows.
 */
export async function migrateDb(db: Db, migrationsFolder: string) {
  await db.run("PRAGMA foreign_keys = OFF");
  await migrate(db, { migrationsFolder });
  const broken = await db.all(sql`PRAGMA foreign_key_check`);
  if (broken.length > 0) {
    throw new Error(`Migration left  rows with broken foreign keys.`);
  }
  await db.run("PRAGMA foreign_keys = ON");
}
