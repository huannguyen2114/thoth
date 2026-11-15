import { type NewSpace, newId, type Space, type SpaceId, type SpaceRepository } from "@thoth/core";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { spaces } from "../schema";

type Row = typeof spaces.$inferSelect;
const toDomain = (r: Row): Space => ({ ...r, id: r.id as SpaceId });

export class DrizzleSpaceRepository implements SpaceRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewSpace): Promise<Space> {
    const [row] = await this.db
      .insert(spaces)
      .values({ id: newId<SpaceId>(), ...input })
      .returning();
    if (!row) throw new Error("Insert into spaces returned no row.");
    return toDomain(row);
  }

  async get(id: SpaceId): Promise<Space | null> {
    const row = await this.db.query.spaces.findFirst({ where: eq(spaces.id, id) });
    return row ? toDomain(row) : null;
  }

  async list(): Promise<Space[]> {
    const rows = await this.db.select().from(spaces).orderBy(desc(spaces.createdAt));
    return rows.map(toDomain);
  }
}
