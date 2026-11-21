import {
  type AccentColor,
  accentColors,
  type NewSpace,
  newId,
  type Space,
  type SpaceIcon,
  type SpaceId,
  type SpaceRepository,
  spaceIcons,
  type UpdateSpaceInput,
} from "@thoth/core";
import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { spaces } from "../schema";

type Row = typeof spaces.$inferSelect;
const isColor = (v: string | null): v is AccentColor =>
  v !== null && (accentColors as readonly string[]).includes(v);
const isIcon = (v: string | null): v is SpaceIcon =>
  v !== null && (spaceIcons as readonly string[]).includes(v);
const toDomain = (r: Row): Space => ({
  ...r,
  id: r.id as SpaceId,
  color: isColor(r.color) ? r.color : null,
  icon: isIcon(r.icon) ? r.icon : null,
});

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

  async update(id: SpaceId, patch: UpdateSpaceInput): Promise<void> {
    const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(set).length === 0) return;
    await this.db
      .update(spaces)
      .set({ ...set, updatedAt: sql`(unixepoch('subsec') * 1000)` })
      .where(eq(spaces.id, id));
  }
}
