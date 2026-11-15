"use client";

import type { QuizOverview, QuizSetSummary, StudySet, StudySetId } from "@thoth/core";
import { Button } from "@thoth/ui";
import { useCallback, useEffect, useState } from "react";
import type { LearnTool, LearnToolProps } from "@/features/learn-panel/types";
import { deleteQuizSetAction, generateQuizAction, loadQuizOverviewAction } from "./actions";
import { GenerateQuizDialog } from "./generate-dialog";
import { QuizPlayer } from "./player";

const percent = (n: number) => `${Math.round(n * 100)}%`;

function QuizPanel({ contentId, onCite }: LearnToolProps) {
  const [overview, setOverview] = useState<QuizOverview | null>(null);
  const [dialog, setDialog] = useState(false);
  const [playing, setPlaying] = useState<StudySetId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async () => setOverview(await loadQuizOverviewAction(contentId)),
    [contentId],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);

  // While anything is generating, check again every few seconds.
  const busy = overview?.sets.some((s) => s.set.status === "generating") ?? false;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [busy, refresh]);

  const sets = overview?.sets ?? [];
  const current = sets.find((s) => s.set.id === playing);
  if (current) {
    const i = sets.indexOf(current);
    return (
      <QuizPlayer
        key={current.set.id}
        set={current.set}
        nextSet={sets[i + 1]?.set ?? null}
        onCite={onCite}
        onExit={() => {
          setPlaying(null);
          refresh();
        }}
        onOpenSet={setPlaying}
        onGenerateMore={async () => {
          const stored = current.set.options as { chapterIds?: string[]; [k: string]: unknown };
          const r = await generateQuizAction(contentId, {
            ...stored,
            chapterIds: stored.chapterId ? [stored.chapterId] : [],
          });
          if (!r.ok) return r.error;
          setPlaying(null);
          await refresh();
          return null;
        }}
      />
    );
  }

  async function remove(set: StudySet) {
    const r = await deleteQuizSetAction(set.id);
    if (!r.ok) setError(r.error);
    await refresh();
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Quiz">
      <div className="flex items-center justify-between gap-4">
        <h3 className="type-heading-3 text-ink">Quizzes</h3>
        <Button variant="primary" onClick={() => setDialog(true)}>
          Generate quiz
        </Button>
      </div>

      {error && (
        <div className="callout callout--danger" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}

      {overview && overview.weakTopics.length > 0 && (
        <div className="callout callout--info" role="note">
          <div>
            <p className="callout__title">Topics to review</p>
            <ul className="callout__text">
              {overview.weakTopics.map((t) => (
                <li key={t.topic}>
                  {t.topic}: {percent(t.averageScore)} average over {t.answered} question
                  {t.answered === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!overview ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />
      ) : sets.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
          <h4 className="type-heading-3 text-ink">No quizzes yet</h4>
          <p className="mt-1 text-ink-muted">
            Generate a quiz to test yourself on each topic of this content.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sets.map((s) => (
            <SetRow
              key={s.set.id}
              summary={s}
              onPlay={() => setPlaying(s.set.id)}
              onDelete={() => remove(s.set)}
            />
          ))}
        </ul>
      )}

      {dialog && (
        <GenerateQuizDialog
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

function SetRow({
  summary,
  onPlay,
  onDelete,
}: {
  summary: QuizSetSummary;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const { set } = summary;
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-200 p-4">
      <div className="min-w-0">
        <p className="type-body-strong truncate text-ink">{set.title}</p>
        <p className="type-caption text-ink-muted">
          {set.status === "generating" && "Writing questions. This takes about a minute."}
          {set.status === "failed" && (set.error ?? "Generation failed.")}
          {set.status === "ready" &&
            `${summary.questionCount} questions` +
              (summary.averageScore === null
                ? ""
                : ` · ${summary.answered} answered, ${percent(summary.averageScore)} average`)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {set.status === "generating" && <span className="badge badge--info">Generating</span>}
        {set.status === "failed" && <span className="badge badge--danger">Failed</span>}
        {set.status === "ready" && (
          <Button size="sm" onClick={onPlay}>
            {summary.answered > 0 ? "Play again" : "Start"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${set.title}`}>
          Delete
        </Button>
      </div>
    </li>
  );
}

export const quizTool: LearnTool = {
  id: "quiz",
  label: "Quiz",
  description: "Questions by topic, with explanations.",
  Panel: QuizPanel,
};
