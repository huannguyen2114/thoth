import {
  type ContentId,
  type NewPlanItem,
  type NewStudyPlan,
  newId,
  type PlanId,
  type PlanItem,
  type PlanItemId,
  type PlanRepository,
  type SpaceId,
  type StudyPlan,
} from "@thoth/core";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { planItems, studyPlans } from "../schema";

const toPlan = (r: typeof studyPlans.$inferSelect): StudyPlan => ({
  ...r,
  id: r.id as PlanId,
  spaceId: r.spaceId as SpaceId | null,
  contentIds: r.contentIds as ContentId[],
});
const toItem = (r: typeof planItems.$inferSelect): PlanItem => ({
  ...r,
  id: r.id as PlanItemId,
  planId: r.planId as PlanId,
  contentId: r.contentId as ContentId | null,
});
const touch = { updatedAt: sql`(unixepoch('subsec') * 1000)` };

export class DrizzlePlanRepository implements PlanRepository {
  constructor(private readonly db: Db) {}

  async create(plan: NewStudyPlan) {
    const [row] = await this.db
      .insert(studyPlans)
      .values({ id: newId<PlanId>(), ...plan })
      .returning();
    if (!row) throw new Error("Insert into study_plans returned no row.");
    return toPlan(row);
  }

  async get(id: PlanId) {
    const row = await this.db.query.studyPlans.findFirst({ where: eq(studyPlans.id, id) });
    return row ? toPlan(row) : null;
  }

  async list() {
    const rows = await this.db.select().from(studyPlans).orderBy(desc(studyPlans.createdAt));
    return rows.map(toPlan);
  }

  async update(id: PlanId, patch: Partial<NewStudyPlan>) {
    await this.db
      .update(studyPlans)
      .set({ ...patch, ...touch })
      .where(eq(studyPlans.id, id));
  }

  async delete(id: PlanId) {
    await this.db.delete(studyPlans).where(eq(studyPlans.id, id));
  }

  async replaceOpenItems(planId: PlanId, items: NewPlanItem[]) {
    return this.db.transaction(async (tx) => {
      await tx.delete(planItems).where(and(eq(planItems.planId, planId), isNull(planItems.doneAt)));
      if (items.length === 0) return [];
      const rows = await tx
        .insert(planItems)
        .values(items.map((i) => ({ id: newId<PlanItemId>(), planId, ...i })))
        .returning();
      return rows.map(toItem).sort((a, b) => a.day.localeCompare(b.day) || a.idx - b.idx);
    });
  }

  async listItems(planId: PlanId) {
    const rows = await this.db
      .select()
      .from(planItems)
      .where(eq(planItems.planId, planId))
      .orderBy(asc(planItems.day), asc(planItems.idx));
    return rows.map(toItem);
  }

  async listItemsForDay(day: string) {
    const rows = await this.db
      .select()
      .from(planItems)
      .where(eq(planItems.day, day))
      .orderBy(asc(planItems.planId), asc(planItems.idx));
    return rows.map(toItem);
  }

  async setDone(itemId: PlanItemId, doneAt: Date | null) {
    await this.db.update(planItems).set({ doneAt }).where(eq(planItems.id, itemId));
  }

  async updateItem(
    itemId: PlanItemId,
    patch: Partial<Pick<PlanItem, "title" | "minutes" | "day">>,
  ) {
    await this.db.update(planItems).set(patch).where(eq(planItems.id, itemId));
  }
}
