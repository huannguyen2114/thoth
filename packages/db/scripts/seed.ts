/** pnpm --filter @thoth/db seed  — inserts the two sample contents into <repo>/data/thoth.db */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, migrateDb } from "../src/client";
import { seedSampleContent } from "../src/seed";

const dataDir =
  process.env.THOTH_DATA_DIR ?? fileURLToPath(new URL("../../../data", import.meta.url));
const db = createDb(`file:${resolve(dataDir, "thoth.db")}`);
await migrateDb(db, fileURLToPath(new URL("../drizzle", import.meta.url)));
const ids = await seedSampleContent(db);
console.log(`Seeded: ${ids.join(", ")}`);
