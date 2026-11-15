"use client";

import { citationToken, type DueCard, type ReviewRating } from "@thoth/core";
import { Button } from "@thoth/ui";
import { useState } from "react";
import { reviewCardAction } from "./actions";

const ratings: { rating: ReviewRating; label: string }[] = [
  { rating: 1, label: "Again" },
  { rating: 2, label: "Hard" },
  { rating: 3, label: "Good" },
  { rating: 4, label: "Easy" },
];

/** A card that comes due again within this window stays in the session (FSRS learning steps). */
const SAME_SESSION_MS = 20 * 60_000;

/** Flip, rate, next. Shared by a set's own review and the /review page. */
export function ReviewSession({
  cards,
  onFinish,
  finishLabel,
  onCite,
}: {
  cards: DueCard[];
  onFinish?: () => void;
  finishLabel?: string;
  onCite?: ((token: string) => void) | undefined;
}) {
  const [queue, setQueue] = useState<DueCard[]>(cards);
  const [reviewed, setReviewed] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = queue[0];
  if (!current) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-surface-200 p-6">
        <h3 className="type-heading-3 text-ink">All caught up</h3>
        <p className="text-ink-muted">
          {reviewed > 0
            ? `You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"}. The rest are scheduled for later.`
            : "No cards are due right now."}
        </p>
        {onFinish && <Button onClick={onFinish}>{finishLabel ?? "Done"}</Button>}
      </div>
    );
  }

  async function rate(rating: ReviewRating) {
    if (!current) return;
    setPending(true);
    setError(null);
    const r = await reviewCardAction(current.card.id, rating);
    setPending(false);
    if (!r.ok) return setError(r.error);
    const soon = r.value.next.due.getTime() - Date.now() < SAME_SESSION_MS;
    setQueue((q) => [...q.slice(1), ...(soon ? [r.value.dueCard] : [])]);
    setReviewed((n) => n + 1);
    setFlipped(false);
  }

  const { card, intervals } = current;
  return (
    <section className="flex flex-col gap-4" aria-label="Review">
      <p className="type-caption text-ink-muted">
        {queue.length} left · {reviewed} reviewed · {card.topic}
      </p>
      <div className="flex min-h-48 flex-col justify-center gap-4 rounded-lg border border-border-subtle bg-surface-200 p-6">
        <p className="type-overline text-ink-muted">Front</p>
        <p className="type-heading-3 text-ink">{card.front}</p>
        {flipped && (
          <>
            <hr className="border-border-subtle" />
            <p className="type-overline text-ink-muted">Back</p>
            <p className="type-body-lg text-ink">{card.back}</p>
            {card.locator && onCite && (
              <button
                type="button"
                className="badge badge--accent cursor-pointer self-start"
                onClick={() => card.locator && onCite(citationToken(card.locator))}
              >
                {citationToken(card.locator)}
              </button>
            )}
          </>
        )}
      </div>
      {error && (
        <div className="callout callout--danger" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}
      {flipped ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">How well did you remember it?</legend>
          {ratings.map(({ rating, label }) => (
            <Button
              key={rating}
              variant={rating === 3 ? "primary" : "secondary"}
              disabled={pending}
              onClick={() => rate(rating)}
            >
              {label} <span className="type-caption opacity-80">{intervals[rating]}</span>
            </Button>
          ))}
        </fieldset>
      ) : (
        <div>
          <Button variant="primary" onClick={() => setFlipped(true)}>
            Show answer
          </Button>
        </div>
      )}
    </section>
  );
}
