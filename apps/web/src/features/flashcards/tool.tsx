"use client";

import type { DueCard, FlashcardSetSummary, StudySetId } from "@thoth/core";
import { Button } from "@thoth/ui";
import { useCallback, useEffect, useState } from "react";
import type { LearnTool, LearnToolProps } from "@/features/learn-panel/types";
import { deleteFlashcardSetAction, loadFlashcardSetsAction, loadSetCardsAction } from "./actions";
import { CardList } from "./card-list";
import { GenerateFlashcardsDialog } from "./generate-dialog";
import { ReviewSession } from "./review-session";

function FlashcardsPanel({ contentId, onCite }: LearnToolProps) {
  const [sets, setSets] = useState<FlashcardSetSummary[] | null>(null);
  const [dialog, setDialog] = useState(false);
  const [open, setOpen] = useState<StudySetId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async () => setSets(await loadFlashcardSetsAction(contentId)),
    [contentId],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);

  const busy = sets?.some((s) => s.set.status === "generating") ?? false;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [busy, refresh]);

  const current = sets?.find((s) => s.set.id === open);
  if (current) {
    return (
      <SetView
        summary={current}
        onCite={onCite}
        onBack={() => {
          setOpen(null);
          refresh();
        }}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Flashcards">
      <div className="flex items-center justify-between gap-4">
        <h3 className="type-heading-3 text-ink">Flashcards</h3>
        <Button variant="primary" onClick={() => setDialog(true)}>
          Generate flashcards
        </Button>
      </div>
      {error && (
        <div className="callout callout--danger" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}
      {!sets ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />
      ) : sets.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
          <h4 className="type-heading-3 text-ink">No flashcards yet</h4>
          <p className="mt-1 text-ink-muted">
            Generate a deck, then review it with spaced repetition.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sets.map(({ set, cardCount, dueCount }) => (
            <li
              key={set.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-200 p-4"
            >
              <div className="min-w-0">
                <p className="type-body-strong truncate text-ink">{set.title}</p>
                <p className="type-caption text-ink-muted">
                  {set.status === "generating" && "Writing cards. This takes about a minute."}
                  {set.status === "failed" && (set.error ?? "Generation failed.")}
                  {set.status === "ready" && `${cardCount} cards · ${dueCount} due`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {set.status === "generating" && (
                  <span className="badge badge--info">Generating</span>
                )}
                {set.status === "failed" && <span className="badge badge--danger">Failed</span>}
                {set.status === "ready" && (
                  <Button size="sm" onClick={() => setOpen(set.id)}>
                    Open
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${set.title}`}
                  onClick={async () => {
                    const r = await deleteFlashcardSetAction(set.id);
                    if (!r.ok) setError(r.error);
                    refresh();
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialog && (
        <GenerateFlashcardsDialog
          contentId={contentId}
          onClose={() => setDialog(false)}
          onStarted={() => {
            setDialog(false);
            refresh();
          }}
        />
      )}
    </section>
  );
}

/** One deck: review what is due, or browse and edit every card. */
function SetView({
  summary,
  onBack,
  onCite,
}: {
  summary: FlashcardSetSummary;
  onBack: () => void;
  onCite?: ((t: string) => void) | undefined;
}) {
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [mode, setMode] = useState<"browse" | "review">("browse");
  const load = useCallback(
    async () => setCards(await loadSetCardsAction(summary.set.id)),
    [summary.set.id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const now = Date.now();
  const due = cards?.filter((c) => c.card.fsrs.due.getTime() <= now) ?? [];

  return (
    <section className="flex flex-col gap-4" aria-label={summary.set.title}>
      <header className="flex items-center justify-between gap-4">
        <h3 className="type-heading-3 text-ink">{summary.set.title}</h3>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to flashcards
        </Button>
      </header>
      {!cards ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />
      ) : mode === "review" ? (
        <ReviewSession
          cards={due}
          onCite={onCite}
          finishLabel="Back to cards"
          onFinish={() => {
            setMode("browse");
            load();
          }}
        />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={due.length === 0} onClick={() => setMode("review")}>
              {due.length ? `Review ${due.length} due` : "Nothing due"}
            </Button>
            <span className="type-caption text-ink-muted">{cards.length} cards</span>
          </div>
          <CardList cards={cards} onChanged={load} />
        </>
      )}
    </section>
  );
}

export const flashcardsTool: LearnTool = {
  id: "flashcards",
  label: "Flashcards",
  description: "Cards you review with spaced repetition.",
  Panel: FlashcardsPanel,
};
