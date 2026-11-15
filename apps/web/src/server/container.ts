import "server-only";
import { resolve } from "node:path";
import type { SpaceRepository } from "@thoth/core";
import { createDb, DrizzleSpaceRepository, migrateDb } from "@thoth/db";
import { env } from "./env";

/**
 * Composition root: the ONLY place that wires adapters to ports.
 * UI code asks for the container; it never imports @thoth/db directly.
 * See docs/technical_design/01-architecture.md.
 */
export interface Container {
  spaces: SpaceRepository;
}

let ready: Promise<Container> | undefined;

async function build(): Promise<Container> {
  const db = createDb(`file:${resolve(env.THOTH_DATA_DIR, "thoth.db")}`);
  await migrateDb(db, resolve(process.cwd(), "../../packages/db/drizzle"));
  return { spaces: new DrizzleSpaceRepository(db) };
}

export function getContainer(): Promise<Container> {
  ready ??= build();
  return ready;
}
