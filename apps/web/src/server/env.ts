import "server-only";
import { resolve } from "node:path";
import { z } from "zod";

/** All server env vars, parsed once. Add new ones here and to .env.example. */
const schema = z.object({
  THOTH_DATA_DIR: z.string().default(resolve(process.cwd(), "../../data")),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
