import { type Job, type JobId, type JobKind, type JobRepository, newId } from "@thoth/core";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Db } from "../client";
import { jobs } from "../schema";

const toDomain = (r: typeof jobs.$inferSelect): Job => ({ ...r, id: r.id as JobId });
const touch = { updatedAt: sql`(unixepoch('subsec') * 1000)` };

export class DrizzleJobRepository implements JobRepository {
  constructor(private readonly db: Db) {}

  async enqueue(kind: JobKind, payload: Record<string, unknown>, runAfter = new Date()) {
    const [row] = await this.db
      .insert(jobs)
      .values({ id: newId<JobId>(), kind, payload, runAfter })
      .returning();
    if (!row) throw new Error("Insert into jobs returned no row.");
    return toDomain(row);
  }

  async claimNext(now: Date) {
    return this.db.transaction(async (tx) => {
      const [next] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, "queued"), lte(jobs.runAfter, now)))
        .orderBy(asc(jobs.runAfter))
        .limit(1);
      if (!next) return null;
      const [row] = await tx
        .update(jobs)
        .set({ status: "running", attempts: next.attempts + 1, ...touch })
        .where(and(eq(jobs.id, next.id), eq(jobs.status, "queued")))
        .returning();
      return row ? toDomain(row) : null;
    });
  }

  async complete(id: JobId) {
    await this.db
      .update(jobs)
      .set({ status: "done", error: null, ...touch })
      .where(eq(jobs.id, id));
  }

  async fail(id: JobId, error: string, retryAt: Date | null) {
    await this.db
      .update(jobs)
      .set(
        retryAt
          ? { status: "queued", error, runAfter: retryAt, ...touch }
          : { status: "failed", error, ...touch },
      )
      .where(eq(jobs.id, id));
  }

  async get(id: JobId) {
    const row = await this.db.query.jobs.findFirst({ where: eq(jobs.id, id) });
    return row ? toDomain(row) : null;
  }

  async requeueRunning() {
    const rows = await this.db
      .update(jobs)
      .set({ status: "queued", runAfter: new Date(), ...touch })
      .where(eq(jobs.status, "running"))
      .returning({ id: jobs.id });
    return rows.length;
  }
}
