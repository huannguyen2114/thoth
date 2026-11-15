"use client";

import type { SpaceId, StudySetId } from "@thoth/core";
import { Button } from "@thoth/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { deleteExamAction, type ExamSummary, listExamsAction } from "./actions";
import { type ExamContentOption, NewExamDialog } from "./new-exam-dialog";

const POLL_MS = 3000;

/** The space's exams ("My exams"), with New exam. Polls while one is generating (ADR-0016). */
export function ExamsPanel({
  spaceId,
  contents,
  initial,
}: {
  spaceId: SpaceId;
  contents: ExamContentOption[];
  initial: ExamSummary[];
}) {
  const [exams, setExams] = useState(initial);
  const [open, setOpen] = useState(false);
  const refresh = useCallback(async () => setExams(await listExamsAction(spaceId)), [spaceId]);

  const generating = exams.some((e) => e.status === "generating");
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [generating, refresh]);

  async function remove(id: StudySetId) {
    await deleteExamAction(id);
    await refresh();
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="type-heading-2 text-ink">Exams</h2>
        <Button
          variant="primary"
          onClick={() => setOpen(true)}
          disabled={contents.length === 0}
          title={contents.length === 0 ? "Add content to this space first" : undefined}
        >
          New exam
        </Button>
      </div>

      {exams.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
          <h3 className="type-heading-3 text-ink">No exams yet</h3>
          <p className="mt-1 text-ink-muted">
            {contents.length === 0
              ? "Add content to this space, then create a timed exam across it."
              : "Create a timed exam across the contents of this space."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
          {exams.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="type-body-strong text-ink">{e.title}</span>
                <span className="type-caption text-ink-muted">
                  {e.questionCount} questions · {e.durationMin} min
                  {e.best !== null && ` · best ${Math.round(e.best * 100)}%`}
                </span>
                {e.status === "failed" && e.error && (
                  <span className="type-caption text-danger">{e.error}</span>
                )}
              </div>
              {e.status === "generating" && (
                <span className="badge badge--neutral">Generating</span>
              )}
              {e.status === "failed" && <span className="badge badge--danger">Failed</span>}
              {e.status === "ready" && (
                <Link href={`/exams/${e.id}`} className="btn btn--secondary btn--sm no-underline">
                  {e.latestSubmitted ? "See results" : "Start"}
                </Link>
              )}
              <Button size="sm" variant="ghost" onClick={() => remove(e.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <NewExamDialog
          spaceId={spaceId}
          contents={contents}
          onClose={() => setOpen(false)}
          onCreated={async () => {
            setOpen(false);
            await refresh();
          }}
        />
      )}
    </section>
  );
}
