"use client";

import { citationToken, type QuizQuestion, type StudySet, type SubmittedAnswer } from "@thoth/core";
import { Button, spring } from "@thoth/ui";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { loadQuizQuestionsAction, submitQuizAnswerAction } from "./actions";
import { typeLabels } from "./generate-dialog";
import { type Draft, isAnswered, QuestionInput } from "./question-input";

const percent = (score: number) => `${Math.round(score * 100)}%`;

export interface PlayerProps {
  set: StudySet;
  nextSet: StudySet | null;
  onExit: () => void;
  onOpenSet: (id: StudySet["id"]) => void;
  onGenerateMore: () => Promise<string | null>;
  onCite?: ((token: string) => void) | undefined;
}

/** One question at a time, instant feedback, then a score screen. */
export function QuizPlayer({
  set,
  nextSet,
  onExit,
  onOpenSet,
  onGenerateMore,
  onCite,
}: PlayerProps) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(null);
  const [result, setResult] = useState<SubmittedAnswer | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadQuizQuestionsAction(set.id).then(setQuestions);
  }, [set.id]);

  if (!questions)
    return <div className="h-64 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />;

  const question = questions[index];
  if (!question || index >= questions.length) {
    return (
      <Completion
        set={set}
        questions={questions}
        scores={scores}
        nextSet={nextSet}
        onRestart={() => {
          setIndex(0);
          setScores([]);
          setDraft(null);
          setResult(null);
        }}
        onExit={onExit}
        onOpenSet={onOpenSet}
        onGenerateMore={onGenerateMore}
      />
    );
  }

  async function submit() {
    if (!question || !draft) return;
    setPending(true);
    setError(null);
    const r = await submitQuizAnswerAction(question.id, draft);
    setPending(false);
    if (!r.ok) return setError(r.error);
    setResult(r.value);
    setScores((s) => [...s, r.value.attempt.score]);
  }

  function next() {
    setIndex((i) => i + 1);
    setDraft(null);
    setResult(null);
    setError(null);
  }

  const last = index === questions.length - 1;
  const attempt = result?.attempt;
  const grading = pending && question.type === "free_response";

  return (
    <section className="flex flex-col gap-4" aria-label={set.title}>
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="type-overline text-ink-muted">{set.title}</p>
          <p className="type-caption text-ink-muted">
            Question {index + 1} of {questions.length}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Back to quizzes
        </Button>
      </header>
      <div
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={index + (result ? 1 : 0)}
        className="h-1.5 w-full overflow-hidden rounded-pill bg-neutral-tint"
      >
        <motion.div
          className="h-full rounded-pill bg-accent"
          initial={false}
          animate={{ width: `${((index + (result ? 1 : 0)) / questions.length) * 100}%` }}
          transition={spring.smooth}
        />
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-200 p-6">
        <span className="badge badge--neutral self-start">{typeLabels[question.type]}</span>
        <h3 className="type-heading-3 text-ink">{question.prompt}</h3>
        <QuestionInput
          // Answers are hidden until graded (ADR-0018): show right/wrong from the graded question.
          question={result?.question ?? question}
          draft={draft}
          onChange={setDraft}
          locked={result !== null || pending}
          onSubmit={submit}
        />

        {error && (
          <div className="callout callout--danger" role="alert">
            <p className="callout__text">{error}</p>
          </div>
        )}

        {attempt && (
          <motion.div
            key={question.id}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={
              attempt.correct || attempt.score > 0
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 1, y: 0, scale: 1, x: [0, -8, 8, -5, 5, 0] }
            }
            transition={attempt.correct || attempt.score > 0 ? spring.bouncy : { duration: 0.45 }}
            className={`callout ${attempt.correct ? "callout--success" : attempt.score > 0 ? "callout--warning" : "callout--danger"}`}
            role="status"
          >
            <div>
              <p className="callout__title">
                {attempt.correct
                  ? "Correct"
                  : attempt.score > 0
                    ? `Partly right (${percent(attempt.score)})`
                    : "Not quite"}
              </p>
              {attempt.feedback && <p className="callout__text">{attempt.feedback}</p>}
              <p className="callout__text">{result?.question.explanation}</p>
              {result?.question.answer.type === "free_response" && (
                <p className="callout__text mt-2">Key points: {result.question.answer.rubric}</p>
              )}
              {question.locator && onCite && (
                <button
                  type="button"
                  className="badge badge--accent mt-2 cursor-pointer"
                  onClick={() => question.locator && onCite(citationToken(question.locator))}
                >
                  {citationToken(question.locator)}
                </button>
              )}
            </div>
          </motion.div>
        )}

        <div className="flex justify-end gap-2">
          {result ? (
            <Button variant="primary" onClick={next}>
              {last ? "See results" : "Next question"}
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} disabled={!isAnswered(draft) || pending}>
              {grading ? "Grading your answer" : pending ? "Checking" : "Check answer"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Completion({
  set,
  questions,
  scores,
  nextSet,
  onRestart,
  onExit,
  onOpenSet,
  onGenerateMore,
}: {
  set: StudySet;
  questions: QuizQuestion[];
  scores: number[];
  nextSet: StudySet | null;
  onRestart: () => void;
  onExit: () => void;
  onOpenSet: PlayerProps["onOpenSet"];
  onGenerateMore: PlayerProps["onGenerateMore"];
}) {
  const total = scores.reduce((a, b) => a + b, 0);
  const average = scores.length ? total / scores.length : 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    setBusy(true);
    const e = await onGenerateMore();
    setBusy(false);
    if (e) setError(e);
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-200 p-6"
      aria-label="Quiz results"
    >
      <p className="type-overline text-ink-muted">{set.title}</p>
      <h3 className="type-display-lg text-ink">{percent(average)}</h3>
      <p className="text-ink-muted">
        {total % 1 === 0 ? total : total.toFixed(1)} of {questions.length} points.{" "}
        {average >= 0.8 ? "You know this topic well." : "Review the explanations, then try again."}
      </p>
      {error && (
        <div className="callout callout--danger" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRestart}>Restart</Button>
        <Button onClick={more} disabled={busy}>
          {busy ? "Starting" : "Generate more"}
        </Button>
        {nextSet && nextSet.status === "ready" && (
          <Button variant="primary" onClick={() => onOpenSet(nextSet.id)}>
            Next: {nextSet.title}
          </Button>
        )}
        <Button variant="ghost" onClick={onExit}>
          Back to quizzes
        </Button>
      </div>
    </section>
  );
}
