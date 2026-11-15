import {
  type ExamSession,
  type ExamSessionId,
  type ExamSessionRepository,
  newId,
  type StudySetId,
} from "@thoth/core";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { examSessions } from "../schema";

const toDomain = (r: typeof examSessions.$inferSelect): ExamSession => ({
  ...r,
  id: r.id as ExamSessionId,
  setId: r.setId as StudySetId,
});

export class DrizzleExamSessionRepository implements ExamSessionRepository {
  constructor(private readonly db: Db) {}

  async start(setId: StudySetId, startedAt: Date, deadlineAt: Date) {
    const [row] = await this.db
      .insert(examSessions)
      .values({ id: newId<ExamSessionId>(), setId, startedAt, deadlineAt })
      .returning();
    if (!row) throw new Error("Insert into exam_sessions returned no row.");
    return toDomain(row);
  }

  async get(id: ExamSessionId) {
    const row = await this.db.query.examSessions.findFirst({ where: eq(examSessions.id, id) });
    return row ? toDomain(row) : null;
  }

  async listBySet(setId: StudySetId) {
    const rows = await this.db
      .select()
      .from(examSessions)
      .where(eq(examSessions.setId, setId))
      .orderBy(desc(examSessions.startedAt));
    return rows.map(toDomain);
  }

  async submit(id: ExamSessionId, submittedAt: Date, score: number) {
    await this.db.update(examSessions).set({ submittedAt, score }).where(eq(examSessions.id, id));
  }
}
