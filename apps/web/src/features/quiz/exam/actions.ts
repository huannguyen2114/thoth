"use server";

import {
  type ExamResult,
  type ExamSessionId,
  type ExamSitting,
  getExamResult,
  getSpaceOverview,
  runExamGeneration,
  type SpaceId,
  type StudySetId,
  startExam,
  startExamGeneration,
  submitExam,
} from "@thoth/core";
import { after } from "next/server";
import { type ActionResult, toActionResult } from "@/lib/action-result";
import { getContainer } from "@/server/container";

/** Thin adapters: container -> core use case -> plain result (ADR-0011, ADR-0018). */

export interface ExamSummary {
  id: StudySetId;
  title: string;
  status: "generating" | "ready" | "failed";
  error: string | null;
  questionCount: number;
  durationMin: number;
  best: number | null;
  latestSubmitted: boolean;
}

export async function listExamsAction(spaceId: SpaceId): Promise<ExamSummary[]> {
  const c = await getContainer();
  const r = await getSpaceOverview(c, spaceId);
  if (!r.ok) return [];
  return r.value.exams.map(({ set, best, latest }) => {
    const options = set.options as { count?: number; durationMin?: number };
    return {
      id: set.id,
      title: set.title,
      status: set.status,
      error: set.error,
      questionCount: options.count ?? 0,
      durationMin: options.durationMin ?? 0,
      best,
      latestSubmitted: Boolean(latest?.submittedAt),
    };
  });
}

/** Creates the exam set now; questions are written after the response (ADR-0016). */
export async function generateExamAction(
  spaceId: SpaceId,
  options: unknown,
): Promise<ActionResult<{ setId: StudySetId }>> {
  const c = await getContainer();
  const r = await startExamGeneration(c, { spaceId, options });
  if (!r.ok) return toActionResult(r);
  const setId = r.value.id;
  after(async () => {
    await runExamGeneration(c, setId);
  });
  return { ok: true, value: { setId } };
}

export async function deleteExamAction(setId: StudySetId): Promise<ActionResult<null>> {
  const c = await getContainer();
  await c.studySets.delete(setId);
  return { ok: true, value: null };
}

/** Starts a sitting, or resumes the open one. Answer keys are already stripped. */
export async function startExamAction(setId: StudySetId): Promise<ActionResult<ExamSitting>> {
  return toActionResult(await startExam(await getContainer(), setId, new Date()));
}

export async function submitExamAction(
  sessionId: ExamSessionId,
  responses: Record<string, unknown>,
): Promise<ActionResult<ExamResult>> {
  return toActionResult(
    await submitExam(await getContainer(), { sessionId, responses }, new Date()),
  );
}

export async function loadExamResultAction(
  sessionId: ExamSessionId,
): Promise<ActionResult<ExamResult>> {
  return toActionResult(await getExamResult(await getContainer(), sessionId));
}
