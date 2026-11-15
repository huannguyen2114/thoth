import {
  type Flashcard,
  type FlashcardId,
  type FlashcardRepository,
  type FsrsState,
  type Locator,
  type NewFlashcard,
  newFsrsState,
  newId,
  type Review,
  type ReviewId,
  type ReviewRating,
  type StudySetId,
} from "@thoth/core";
import { asc, eq, lte } from "drizzle-orm";
import type { Db } from "../client";
import { flashcards, reviews } from "../schema";

type Row = typeof flashcards.$inferSelect;
const toDomain = (r: Row): Flashcard => ({
  id: r.id as FlashcardId,
  setId: r.setId as StudySetId,
  idx: r.idx,
  front: r.front,
  back: r.back,
  topic: r.topic,
  locator: (r.locator ?? null) as Locator | null,
  fsrs: {
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    elapsedDays: r.elapsedDays,
    scheduledDays: r.scheduledDays,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as FsrsState["state"],
    lastReview: r.lastReview,
  },
});

export class DrizzleFlashcardRepository implements FlashcardRepository {
  constructor(private readonly db: Db) {}

  async addCards(setId: StudySetId, cards: NewFlashcard[], now: Date) {
    if (cards.length === 0) return [];
    const fsrs = newFsrsState(now);
    const rows = await this.db
      .insert(flashcards)
      .values(cards.map((c) => ({ id: newId<FlashcardId>(), setId, ...c, ...fsrs })))
      .returning();
    return rows.map(toDomain).sort((a, b) => a.idx - b.idx);
  }

  async listBySet(setId: StudySetId) {
    const rows = await this.db
      .select()
      .from(flashcards)
      .where(eq(flashcards.setId, setId))
      .orderBy(asc(flashcards.idx));
    return rows.map(toDomain);
  }

  async get(id: FlashcardId) {
    const row = await this.db.query.flashcards.findFirst({ where: eq(flashcards.id, id) });
    return row ? toDomain(row) : null;
  }

  async update(id: FlashcardId, patch: Partial<Pick<Flashcard, "front" | "back">>) {
    await this.db.update(flashcards).set(patch).where(eq(flashcards.id, id));
  }

  async delete(id: FlashcardId) {
    await this.db.delete(flashcards).where(eq(flashcards.id, id));
  }

  async listDue(now: Date, limit: number) {
    const rows = await this.db
      .select()
      .from(flashcards)
      .where(lte(flashcards.due, now))
      .orderBy(asc(flashcards.due))
      .limit(limit);
    return rows.map(toDomain);
  }

  async recordReview(id: FlashcardId, rating: ReviewRating, next: FsrsState, at: Date) {
    return this.db.transaction(async (tx) => {
      await tx.update(flashcards).set(next).where(eq(flashcards.id, id));
      const [row] = await tx
        .insert(reviews)
        .values({ id: newId<ReviewId>(), cardId: id, rating, reviewedAt: at })
        .returning();
      if (!row) throw new Error("Insert into reviews returned no row.");
      return {
        id: row.id as ReviewId,
        cardId: row.cardId as FlashcardId,
        rating: row.rating as ReviewRating,
        reviewedAt: row.reviewedAt,
      } satisfies Review;
    });
  }
}
