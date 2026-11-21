import { describe, expect, it } from "vitest";
import type { NewSpace, Space } from "../domain/space";
import type { SpaceRepository } from "../ports/repositories";
import { newId, type SpaceId } from "../shared/id";
import { createSpace } from "./spaces";

class InMemorySpaces implements SpaceRepository {
  rows: Space[] = [];
  async create(input: NewSpace) {
    const now = new Date();
    const s: Space = { id: newId<SpaceId>(), ...input, createdAt: now, updatedAt: now };
    this.rows.push(s);
    return s;
  }
  async get(id: SpaceId) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async list() {
    return this.rows;
  }
  async update() {}
}

describe("createSpace", () => {
  it("trims and saves a valid space", async () => {
    const spaces = new InMemorySpaces();
    const r = await createSpace({ spaces }, { name: "  Biology  " });
    expect(r.ok && r.value.name).toBe("Biology");
    expect(spaces.rows).toHaveLength(1);
  });

  it("rejects an empty name with a fix-it message", async () => {
    const r = await createSpace({ spaces: new InMemorySpaces() }, { name: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "validation" });
  });
});
