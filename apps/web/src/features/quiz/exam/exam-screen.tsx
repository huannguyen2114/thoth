"use client";

import {
  citationToken,
  type ExamResult,
  type ExamSitting,
  type QuizQuestion,
  type StudySetId,
} from "@thoth/core";
import { Button, cx } from "@thoth/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { type Draft, isAnswered, QuestionInput } from "../question-input";
import { startExamAction, submitExamAction } from "./actions";

type Phase =
  | { kind: "intro" }
  | { kind: "running"; sitting: ExamSitting }
  | { kind: "result"; result: ExamResult };

/** The whole exam flow for one exam: intro, timed sitting, results (ADR-0018). */
export function ExamScreen({
  setId,
  title,
  questionCount,
  durationMin,
  lastResult,
}: {
  setId: StudySetId;
  title: string;
  questionCount: number;
  durationMin: number;
  lastResult: ExamResult | null;
}) {
  const [phase, setPhase] = useState<Phase>(
    lastResult ? { kind: "result", result: lastResult } : { kind: "intro" },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const begin = () =>
    start(async () => {
      setError(null);
      const r = await startExamAction(setId);
      if (r.ok) setPhase({ kind: "running", sitting: r.value });
      else setError(r.error);
    });

  if (phase.kind === "running") {
    return (
      <ExamRunner
        sitting={phase.sitting}
        onDone={(result) => setPhase({ kind: "result", result })}
      />
    );
  }
  if (phase.kind === "result")
    return <ExamResults result={phase.result} onRetake={begin} retaking={pending} />;

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border-subtle bg-surface-200 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="type-heading-1 text-ink">{title}</h1>
        <p className="text-ink-muted">
          {questionCount} questions · {durationMin} minutes. The timer starts when you press Start
          and keeps running if you leave. When time is up, your answers are submitted.
        </p>
      </div>
      {error && (
        <div className="callout callout--danger max-w-none" role="alert">
          <p className="m-0">{error}</p>
        </div>
      )}
      <div>
        <Button variant="primary" size="lg" onClick={begin} disabled={pending}>
          {pending ? "Starting" : "Start exam"}
        </Button>
      </div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const draftKey = (sessionId: string) => `thoth.exam.${sessionId}`;

function ExamRunner({
  sitting,
  onDone,
}: {
  sitting: ExamSitting;
  onDone: (r: ExamResult) => void;
}) {
  const { session, questions } = sitting;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    // Per-viewer convenience: restore unsent answers after a reload.
    try {
      return JSON.parse(localStorage.getItem(draftKey(session.id)) ?? "{}");
    } catch {
      return {};
    }
  });
  const [left, setLeft] = useState(() => new Date(session.deadlineAt).getTime() - Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey(session.id), JSON.stringify(drafts));
    } catch {}
  }, [drafts, session.id]);

  const submit = useCallback(async () => {
    if (sent.current) return;
    sent.current = true;
    setSubmitting(true);
    setError(null);
    const r = await submitExamAction(session.id, drafts);
    if (r.ok) {
      try {
        localStorage.removeItem(draftKey(session.id));
      } catch {}
      onDone(r.value);
    } else {
      sent.current = false;
      setSubmitting(false);
      setError(r.error);
    }
  }, [drafts, onDone, session.id]);

  useEffect(() => {
    const t = setInterval(() => {
      const ms = new Date(session.deadlineAt).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) void submit();
    }, 1000);
    return () => clearInterval(t);
  }, [session.deadlineAt, submit]);

  const answered = questions.filter((q) => isAnswered(drafts[q.id] ?? null)).length;
  const secs = Math.max(0, Math.floor(left / 1000));
  const lowTime = secs < 60;

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-200 px-4 py-3 shadow-hearth-sm">
        <span className="type-body-strong text-ink">{sitting.set.title}</span>
        <span className="type-caption text-ink-muted">
          {answered} of {questions.length} answered
        </span>
        <span
          className={cx("type-label tabular-nums", lowTime ? "text-danger" : "text-ink")}
          role="timer"
          aria-live={lowTime ? "assertive" : "off"}
        >
          {Math.floor(secs / 60)}:{pad(secs % 60)} left
        </span>
        <Button
          variant="primary"
          onClick={() => {
            const unanswered = questions.length - answered;
            if (
              unanswered > 0 &&
              !confirm(`${unanswered} questions are unanswered. Submit anyway?`)
            )
              return;
            void submit();
          }}
          disabled={submitting}
        >
          {submitting ? "Grading" : "Submit exam"}
        </Button>
      </div>

      {error && (
        <div className="callout callout--danger max-w-none" role="alert">
          <p className="m-0">{error}</p>
        </div>
      )}

      <ol className="flex flex-col gap-6">
        {questions.map((q, i) => (
          <li
            key={q.id}
            className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-200 p-5"
          >
            <p className="type-caption text-ink-muted">
              Question {i + 1} · {q.topic}
            </p>
            <p className="type-body-lg text-ink">{q.prompt}</p>
            <QuestionInput
              question={q}
              draft={drafts[q.id] ?? null}
              onChange={(d) => setDrafts((all) => ({ ...all, [q.id]: d }))}
              locked={submitting}
              onSubmit={() => {}}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- Results ---------------- */

function answerText(q: QuizQuestion): string {
  const a = q.answer;
  const choices = q.choices ?? [];
  switch (a.type) {
    case "multiple_choice":
      return choices[a.index] ?? "";
    case "multi_select":
      return a.indices
        .map((i) => choices[i])
        .filter(Boolean)
        .join("; ");
    case "true_false":
      return a.value ? "True" : "False";
    case "fill_blank":
      return a.accepted.join(" / ");
    case "free_response":
      return a.rubric;
  }
}

function responseText(q: QuizQuestion, response: unknown): string {
  const r = response as Record<string, unknown> | null;
  if (!r) return "No answer";
  const choices = q.choices ?? [];
  if (typeof r.index === "number") return choices[r.index] ?? "";
  if (Array.isArray(r.indices)) return r.indices.map((i) => choices[i as number]).join("; ");
  if (typeof r.value === "boolean") return r.value ? "True" : "False";
  if (typeof r.text === "string") return r.text || "No answer";
  return "No answer";
}

function ExamResults({
  result,
  onRetake,
  retaking,
}: {
  result: ExamResult;
  onRetake: () => void;
  retaking: boolean;
}) {
  const pct = Math.round((result.session.score ?? 0) * 100);
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="type-overline text-ink-muted">{result.set.title}</p>
          <h1 className="type-display-lg text-ink">{pct}%</h1>
          <p className="text-ink-muted">
            Submitted {new Date(result.session.submittedAt ?? 0).toLocaleString("en")}
            {result.late && " · after the time limit"}
          </p>
        </div>
        <Button variant="primary" onClick={onRetake} disabled={retaking}>
          {retaking ? "Starting" : "Retake exam"}
        </Button>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="type-heading-2 text-ink">By topic</h2>
        <ul className="flex flex-col gap-3">
          {result.topics.map((t) => (
            <li key={`${t.contentId}-${t.topic}`} className="flex flex-col gap-1">
              <div className="flex justify-between gap-3">
                <span className="type-label text-ink">{t.topic}</span>
                <span className="type-caption text-ink-muted">
                  {Math.round(t.score * 100)}% · {t.questions} questions
                </span>
              </div>
              <div className="h-2 rounded-pill bg-neutral-tint" aria-hidden="true">
                <div
                  className={cx(
                    "h-2 rounded-pill",
                    t.score >= 0.8 ? "bg-success" : t.score >= 0.5 ? "bg-warning" : "bg-danger",
                  )}
                  style={{ width: `${Math.max(4, t.score * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="type-heading-2 text-ink">Answers</h2>
        <ol className="flex flex-col gap-4">
          {result.items.map(({ question: q, attempt }, i) => {
            const status = !attempt
              ? "Unanswered"
              : attempt.correct
                ? "Correct"
                : attempt.score > 0
                  ? "Partly right"
                  : "Wrong";
            const badge = !attempt
              ? "badge--neutral"
              : attempt.correct
                ? "badge--success"
                : attempt.score > 0
                  ? "badge--warning"
                  : "badge--danger";
            const cite = q.locator && q.contentId ? citationToken(q.locator) : null;
            return (
              <li
                key={q.id}
                className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-200 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="type-caption text-ink-muted">
                    Question {i + 1} · {q.topic}
                  </span>
                  <span className={cx("badge", badge)}>{status}</span>
                </div>
                <p className="type-body-lg text-ink">{q.prompt}</p>
                <p className="type-body text-ink-muted">
                  <span className="type-body-strong text-ink">Your answer: </span>
                  {responseText(q, attempt?.response ?? null)}
                </p>
                <p className="type-body text-ink-muted">
                  <span className="type-body-strong text-ink">
                    {q.answer.type === "free_response" ? "Model answer: " : "Correct answer: "}
                  </span>
                  {answerText(q)}
                </p>
                {attempt?.feedback && <p className="type-body text-ink">{attempt.feedback}</p>}
                <p className="type-body text-ink-muted">{q.explanation}</p>
                {cite && (
                  <Link
                    href={`/content/${q.contentId}?at=${encodeURIComponent(cite)}`}
                    className="type-label text-accent-text"
                  >
                    See this in the source {cite}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
