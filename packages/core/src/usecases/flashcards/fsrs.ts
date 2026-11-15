import { type Card, type FSRS, fsrs, type Grade, type State } from "ts-fsrs";
import type { FsrsState, ReviewRating } from "../../domain/flashcard";

/**
 * FSRS scheduling through ts-fsrs. The app's `FsrsState` is mapped to and from the library's
 * `Card` here, so nothing else in the codebase imports ts-fsrs.
 *
 * Fuzz is off so the same state and clock always give the same schedule (testable, explainable).
 */
const scheduler: FSRS = fsrs({ enable_fuzz: false, enable_short_term: true });

/** Gap that tells us the card has passed the first learning step (steps are 1m then 10m). */
const SECOND_STEP_GAP_MS = 10 * 60_000;

/**
 * ts-fsrs also tracks `learning_steps`, which the stored `FsrsState` has no column for.
 * It is recovered from the last schedule: a Learning card whose previous interval was 10 minutes
 * or more is on its second step. Relearning has one step, so it is always step 0.
 */
function learningStepOf(s: FsrsState): number {
  if (s.state !== 1 || !s.lastReview) return 0;
  return s.due.getTime() - s.lastReview.getTime() >= SECOND_STEP_GAP_MS ? 1 : 0;
}

export function toCard(s: FsrsState): Card {
  return {
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    scheduled_days: s.scheduledDays,
    learning_steps: learningStepOf(s),
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    ...(s.lastReview ? { last_review: s.lastReview } : {}),
  };
}

export function fromCard(c: Card, previous: FsrsState, now: Date): FsrsState {
  const elapsedDays = previous.lastReview
    ? Math.max(0, Math.floor((now.getTime() - previous.lastReview.getTime()) / 86_400_000))
    : 0;
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays,
    scheduledDays: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as FsrsState["state"],
    lastReview: c.last_review ?? now,
  };
}

/** The schedule after rating a card at `now`. Pure: same inputs, same output. */
export function scheduleReview(current: FsrsState, rating: ReviewRating, now: Date): FsrsState {
  const { card } = scheduler.next(toCard(current), now, rating as Grade);
  return fromCard(card, current, now);
}

/** When the card would be due again for each rating, to label the four buttons. */
export function previewReview(current: FsrsState, now: Date): Record<ReviewRating, Date> {
  const log = scheduler.repeat(toCard(current), now);
  return {
    1: log[1].card.due,
    2: log[2].card.due,
    3: log[3].card.due,
    4: log[4].card.due,
  };
}

/** "10m", "3h", "8d", "2mo" for the button under a rating. */
export function formatInterval(from: Date, due: Date): string {
  const min = Math.max(1, Math.round((due.getTime() - from.getTime()) / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo}mo` : `${Math.round(d / 365)}y`;
}
