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
 * Applies pending migrations from `migrationsFolder` (packages/db/drizzle).
 * The caller passes the path: bundlers rewrite import.meta.url, so this package cannot.
 */
export async function migrateDb(db: Db, migrationsFolder: string) {
  await migrate(db, { migrationsFolder });
}
