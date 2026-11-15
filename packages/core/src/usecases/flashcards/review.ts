import type { Flashcard, FsrsState, ReviewRating } from "../../domain/flashcard";
import type { StudySet } from "../../domain/study-set";
import type { FlashcardRepository, StudySetRepository } from "../../ports/repositories";
import type { ContentId, FlashcardId, StudySetId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { failStaleSets } from "../study-sets";
import { formatInterval, previewReview, scheduleReview } from "./fsrs";
import { cardTextSchema } from "./schemas";

export interface FlashcardDeps {
  flashcards: FlashcardRepository;
  studySets: StudySetRepository;
  now?: () => Date;
}

const clock = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

/** A card with the label each rating button shows ("1m", "10m", "3d", "8d"). */
export interface DueCard {
  card: Flashcard;
  intervals: Record<ReviewRating, string>;
}

function withIntervals(card: Flashcard, now: Date): DueCard {
  const due = previewReview(card.fsrs, now);
  return {
    card,
    intervals: {
      1: formatInterval(now, due[1]),
      2: formatInterval(now, due[2]),
      3: formatInterval(now, due[3]),
      4: formatInterval(now, due[4]),
    },
  };
}

/** Cards due now, across every set, oldest due first. */
export async function listDueCards(deps: FlashcardDeps, limit = 100): Promise<DueCard[]> {
  const now = clock(deps);
  return (await deps.flashcards.listDue(now, limit)).map((c) => withIntervals(c, now));
}

/** All cards of one set (with button labels), for the set's own review session. */
export async function listSetCards(deps: FlashcardDeps, setId: StudySetId): Promise<DueCard[]> {
  const now = clock(deps);
  return (await deps.flashcards.listBySet(setId)).map((c) => withIntervals(c, now));
}

export interface ReviewOutcome {
  card: Flashcard;
  next: FsrsState;
  /** The card after the review, with fresh button labels, in case the session shows it again. */
  dueCard: DueCard;
}

/** Schedules the card with FSRS and saves the new state plus a review row in one transaction. */
export async function reviewCard(
  deps: FlashcardDeps,
  input: { cardId: FlashcardId; rating: ReviewRating },
): Promise<Result<ReviewOutcome>> {
  if (![1, 2, 3, 4].includes(input.rating)) {
    return err(appError("validation", "Pick Again, Hard, Good or Easy."));
  }
  const card = await deps.flashcards.get(input.cardId);
  if (!card) return err(appError("not_found", "This card no longer exists."));
  const now = clock(deps);
  const next = scheduleReview(card.fsrs, input.rating, now);
  await deps.flashcards.recordReview(card.id, input.rating, next, now);
  const updated = { ...card, fsrs: next };
  return ok({ card: updated, next, dueCard: withIntervals(updated, now) });
}

export async function editCard(
  deps: FlashcardDeps,
  input: { cardId: FlashcardId; front: string; back: string },
): Promise<Result<void>> {
  const parsed = cardTextSchema.safeParse({ front: input.front, back: input.back });
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid card."));
  }
  if (!(await deps.flashcards.get(input.cardId))) {
    return err(appError("not_found", "This card no longer exists."));
  }
  await deps.flashcards.update(input.cardId, parsed.data);
  return ok(undefined);
}

export async function deleteCard(deps: FlashcardDeps, cardId: FlashcardId): Promise<Result<void>> {
  if (!(await deps.flashcards.get(cardId))) {
    return err(appError("not_found", "This card no longer exists."));
  }
  await deps.flashcards.delete(cardId);
  return ok(undefined);
}

export interface FlashcardSetSummary {
  set: StudySet;
  cardCount: number;
  dueCount: number;
}

/** Flashcard sets of one content, newest first, with how many cards are due. */
export async function listFlashcardSets(
  deps: FlashcardDeps,
  contentId: ContentId,
): Promise<FlashcardSetSummary[]> {
  const now = clock(deps);
  const sets = await failStaleSets(
    deps.studySets,
    await deps.studySets.listByContent(contentId, "flashcards"),
    now,
  );
  return Promise.all(
    sets.map(async (set) => {
      const cards = await deps.flashcards.listBySet(set.id);
      return {
        set,
        cardCount: cards.length,
        dueCount: cards.filter((c) => c.fsrs.due.getTime() <= now.getTime()).length,
      };
    }),
  );
}

export async function deleteFlashcardSet(
  deps: FlashcardDeps,
  setId: StudySetId,
): Promise<Result<void>> {
  const set = await deps.studySets.get(setId);
  if (!set || set.kind !== "flashcards") {
    return err(appError("not_found", "This flashcard set no longer exists."));
  }
  await deps.studySets.delete(setId);
  return ok(undefined);
}
