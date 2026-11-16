import {
  type ActivityDay,
  type ActivityEvent,
  type ActivityKind,
  type ActivityRepository,
  newId,
} from "@thoth/core";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../client";
import { activityEvents } from "../schema";

export class DrizzleActivityRepository implements ActivityRepository {
  constructor(private readonly db: Db) {}

  async record(kind: ActivityKind, ref: string | null, at: Date) {
    await this.db.insert(activityEvents).values({ id: newId<string>(), kind, ref, at });
  }

  async recordThrottled(kind: ActivityKind, ref: string, at: Date, windowMs: number) {
    const since = new Date(at.getTime() - windowMs);
    const recent = await this.db
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.kind, kind),
          eq(activityEvents.ref, ref),
          gte(activityEvents.at, since),
        ),
      )
      .limit(1);
    if (recent.length === 0) await this.record(kind, ref, at);
  }

  async countByDay(from: Date, to: Date, tzOffsetMin: number): Promise<ActivityDay[]> {
    // Local day = UTC instant minus the client's offset (getTimezoneOffset is minutes behind UTC).
    const rows = await this.db.all<{ day: string; count: number }>(sql`
      SELECT strftime('%Y-%m-%d', (at / 1000) - ${tzOffsetMin * 60}, 'unixepoch') AS day,
             count(*) AS count
      FROM activity_events
      WHERE at >= ${from.getTime()} AND at <= ${to.getTime()}
      GROUP BY day
      ORDER BY day`);
    return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
  }

  async listRecent(limit: number): Promise<ActivityEvent[]> {
    const rows = await this.db
      .select()
      .from(activityEvents)
      .orderBy(desc(activityEvents.at))
      .limit(limit);
    return rows;
  }
}
