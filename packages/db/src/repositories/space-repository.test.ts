import { fileURLToPath } from "node:url";
import { createSpace } from "@thoth/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db, migrateDb } from "../client";
import { DrizzleSpaceRepository } from "./space-repository";

describe("DrizzleSpaceRepository", () => {
  let db: Db;
  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateDb(db, fileURLToPath(new URL("../../drizzle", import.meta.url)));
  });

  it("creates and lists spaces through the core use case", async () => {
    const spaces = new DrizzleSpaceRepository(db);
    const r = await createSpace({ spaces }, { name: "Neuroscience" });
    expect(r.ok).toBe(true);
    const all = await spaces.list();
    expect(all.map((s) => s.name)).toEqual(["Neuroscience"]);
    expect(all[0]?.createdAt).toBeInstanceOf(Date);
  });
});
