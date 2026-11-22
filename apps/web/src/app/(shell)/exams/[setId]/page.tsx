import { type ExamResult, getExamResult, type StudySetId } from "@thoth/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppPage } from "@/app/_components/app-shell";
import { ExamScreen } from "@/features/quiz/exam/exam-screen";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Exam" };

/** /exams/[setId]: start or resume a timed sitting, or read the latest result. */
export default function ExamPage({ params }: PageProps<"/exams/[setId]">) {
  return (
    <Suspense fallback={<div className="h-dvh animate-pulse bg-surface-100" />}>
      <AppPage>
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <Exam params={params} />
        </div>
      </AppPage>
    </Suspense>
  );
}

async function Exam({ params }: { params: Promise<{ setId: string }> }) {
  await connection();
  const setId = (await params).setId as StudySetId;
  const c = await getContainer();
  const set = await c.studySets.get(setId);
  if (!set || set.kind !== "exam" || !set.spaceId) notFound();
  const sessions = await c.examSessions.listBySet(setId);
  const latest = sessions[0];
  let lastResult: ExamResult | null = null;
  if (latest?.submittedAt) {
    const r = await getExamResult(c, latest.id);
    if (r.ok) lastResult = r.value;
  }
  const options = set.options as { count?: number; durationMin?: number };
  return (
    <>
      <Link href={`/spaces/${set.spaceId}`} className="type-label text-accent-text">
        Back to the space
      </Link>
      {set.status !== "ready" ? (
        <p className="text-ink-muted">This exam is still being written. Check back in a minute.</p>
      ) : (
        <ExamScreen
          setId={set.id}
          title={set.title}
          questionCount={(await c.quizzes.listQuestions(setId)).length || (options.count ?? 0)}
          durationMin={options.durationMin ?? 0}
          lastResult={lastResult}
        />
      )}
    </>
  );
}
