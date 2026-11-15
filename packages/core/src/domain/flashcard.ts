import type { FlashcardId, ReviewId, StudySetId } from "../shared/id";
import type { Locator } from "./content";

/** FSRS scheduling state, compatible with ts-fsrs `Card` (Phase 6). */
export interface FsrsState {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  /** 0 New, 1 Learning, 2 Review, 3 Relearning (ts-fsrs State). */
  state: 0 | 1 | 2 | 3;
  lastReview: Date | null;
}

export interface Flashcard {
  id: FlashcardId;
  setId: StudySetId;
  idx: number;
  front: string;
  back: string;
  topic: string;
  locator: Locator | null;
  fsrs: FsrsState;
}
export type NewFlashcard = Omit<Flashcard, "id" | "setId" | "fsrs">;

/** 1 Again, 2 Hard, 3 Good, 4 Easy (ts-fsrs Rating). */
export type ReviewRating = 1 | 2 | 3 | 4;

export interface Review {
  id: ReviewId;
  cardId: FlashcardId;
  rating: ReviewRating;
  reviewedAt: Date;
}

/** State of a card never reviewed: due now. */
export const newFsrsState = (now: Date): FsrsState => ({
  due: now,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  reps: 0,
  lapses: 0,
  state: 0,
  lastReview: null,
});
