import {
  type ContentId,
  type Locator,
  type NewQuizAttempt,
  type NewQuizQuestion,
  newId,
  type QuizAnswer,
  type QuizAttempt,
  type QuizAttemptId,
  type QuizQuestion,
  type QuizQuestionId,
  type QuizRepository,
  type StudySetId,
} from "@thoth/core";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { quizAttempts, quizQuestions } from "../schema";

const toQuestion = (r: typeof quizQuestions.$inferSelect): QuizQuestion => ({
  ...r,
  id: r.id as QuizQuestionId,
  setId: r.setId as StudySetId,
  choices: r.choices ?? null,
  answer: r.answer as unknown as QuizAnswer,
  locator: (r.locator ?? null) as Locator | null,
  contentId: (r.contentId ?? null) as ContentId | null,
});
const toAttempt = (r: typeof quizAttempts.$inferSelect): QuizAttempt => ({
  ...r,
  id: r.id as QuizAttemptId,
  questionId: r.questionId as QuizQuestionId,
});

export class DrizzleQuizRepository implements QuizRepository {
  constructor(private readonly db: Db) {}

  async addQuestions(setId: StudySetId, questions: NewQuizQuestion[]) {
    if (questions.length === 0) return [];
    const rows = await this.db
      .insert(quizQuestions)
      .values(
        questions.map((q) => ({
          id: newId<QuizQuestionId>(),
          setId,
          ...q,
          contentId: q.contentId ?? null,
          answer: q.answer as unknown as Record<string, unknown>,
        })),
      )
      .returning();
    return rows.map(toQuestion).sort((a, b) => a.idx - b.idx);
  }

  async listQuestions(setId: StudySetId) {
    const rows = await this.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.setId, setId))
      .orderBy(asc(quizQuestions.idx));
    return rows.map(toQuestion);
  }

  async getQuestion(id: QuizQuestionId) {
    const row = await this.db.query.quizQuestions.findFirst({ where: eq(quizQuestions.id, id) });
    return row ? toQuestion(row) : null;
  }

  async addAttempt(attempt: NewQuizAttempt) {
    const [row] = await this.db
      .insert(quizAttempts)
      .values({ id: newId<QuizAttemptId>(), ...attempt })
      .returning();
    if (!row) throw new Error("Insert into quiz_attempts returned no row.");
    return toAttempt(row);
  }

  async listAttempts(setId: StudySetId) {
    const rows = await this.db
      .select({ a: quizAttempts })
      .from(quizAttempts)
      .innerJoin(quizQuestions, eq(quizAttempts.questionId, quizQuestions.id))
      .where(eq(quizQuestions.setId, setId))
      .orderBy(asc(quizAttempts.createdAt));
    return rows.map((r) => toAttempt(r.a));
  }
}
