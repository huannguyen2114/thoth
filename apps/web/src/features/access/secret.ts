import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

let cached: string | undefined;

export function dataDir(): string {
  return process.env.THOTH_DATA_DIR ?? resolve(process.cwd(), "../../data");
}

/** THOTH_SECRET if set, otherwise a random key created once under the data dir (mode 0600). */
export function getSessionSecret(): string {
  if (process.env.THOTH_SECRET) return process.env.THOTH_SECRET;
  if (cached) return cached;
  const file = resolve(dataDir(), ".session-secret");
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    try {
      writeFileSync(file, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
    } catch (e) {
      // Another module instance won the race; read its file below.
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  try {
    chmodSync(file, 0o600);
  } catch {
    // Not fatal on filesystems without modes.
  }
  cached = readFileSync(file, "utf8").trim();
  return cached;
}
