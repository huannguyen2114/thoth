"use client";

import { citationToken, type DueCard, type ReviewRating } from "@thoth/core";
import { Button, cx, spring } from "@thoth/ui";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CountUp } from "@/app/_components/motion/primitives";
import { reviewCardAction } from "./actions";

/** Each rating wears its meaning (ADR-0047): forgot, hard, good, easy. */
const ratings: { rating: ReviewRating; label: string; tone: string }[] = [
  { rating: 1, label: "Again", tone: "bg-danger-tint" },
  { rating: 2, label: "Hard", tone: "bg-warning-tint" },
  { rating: 3, label: "Good", tone: "bg-success-tint" },
  { rating: 4, label: "Easy", tone: "bg-info-tint" },
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
  const [lastRating, setLastRating] = useState<ReviewRating>(3);

  const current = queue[0];
  if (!current) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring.bouncy}
        className="flex flex-col items-start gap-3 rounded-xl tone-sage p-6"
      >
        {reviewed > 0 && (
          <span className="flex items-baseline gap-2">
            <CountUp value={reviewed} className="type-hero-sm" />
            <span className="type-label">reviewed</span>
          </span>
        )}
        <h3 className="type-heading-2">All caught up</h3>
        <p className="opacity-80">
          {reviewed > 0
            ? `You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"}. The rest are scheduled for later.`
            : "No cards are due right now."}
        </p>
        {onFinish && <Button onClick={onFinish}>{finishLabel ?? "Done"}</Button>}
      </motion.div>
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
    setLastRating(rating);
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
      <div className="relative min-h-56 perspective">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${card.id}-${reviewed}`}
            initial={{ opacity: 0, y: 40, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateY: flipped ? 180 : 0 }}
            exit={{
              opacity: 0,
              x: lastRating === 1 ? -320 : 320,
              rotate: lastRating === 1 ? -10 : 10,
              transition: spring.smooth,
            }}
            transition={spring.smooth}
            className="relative min-h-56 preserve-3d"
          >
            <div className="absolute inset-0 flex flex-col justify-center gap-3 rounded-xl border border-border-subtle bg-surface-200 p-6 shadow-hearth-md backface-hidden">
              <p className="type-overline text-ink-muted">Front</p>
              <p className="type-heading-2 text-ink">{card.front}</p>
            </div>
            <div className="absolute inset-0 flex flex-col justify-center gap-3 rounded-xl border border-border-subtle bg-surface-200 p-6 shadow-hearth-md backface-hidden flip-back">
              {flipped && (
                <>
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
          </motion.div>
        </AnimatePresence>
      </div>
      {error && (
        <div className="callout callout--danger" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}
      {flipped ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">How well did you remember it?</legend>
          {ratings.map(({ rating, label, tone }, i) => (
            <motion.button
              key={rating}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.94 }}
              transition={{ ...spring.snappy, delay: i * 0.04 }}
              disabled={pending}
              onClick={() => rate(rating)}
              className={cx("btn btn--secondary border-transparent text-ink", tone)}
            >
              {label} <span className="type-caption opacity-80">{intervals[rating]}</span>
            </motion.button>
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
