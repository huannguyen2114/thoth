"use server";

import {
  type ContentId,
  deleteQuizSet,
  getQuizOverview,
  getQuizQuestions,
  type QuizOverview,
  type QuizQuestion,
  type QuizQuestionId,
  runQuizGeneration,
  type StudySetId,
  type SubmittedAnswer,
  startQuizGeneration,
  submitQuizAnswer,
} from "@thoth/core";
import { after } from "next/server";
import { getContainer } from "@/server/container";
import { type ActionResult, toActionResult } from "./action-result";

/** Thin adapters: container -> core use case -> plain result. No business rules here. */

export interface TopicOption {
  id: string;
  title: string;
}

/** The chapters the owner can pick as quiz and flashcard topics. */
export async function listTopicsAction(contentId: ContentId): Promise<TopicOption[]> {
  const { chapters } = await getContainer();
  return (await chapters.listByContent(contentId))
    .sort((a, b) => a.idx - b.idx)
    .map((c) => ({ id: c.id, title: c.title }));
}

export async function loadQuizOverviewAction(contentId: ContentId): Promise<QuizOverview> {
  const { studySets, quizzes } = await getContainer();
  return getQuizOverview({ studySets, quizzes }, contentId);
}

export async function loadQuizQuestionsAction(setId: StudySetId): Promise<QuizQuestion[]> {
  const { quizzes } = await getContainer();
  return getQuizQuestions({ quizzes }, setId);
}

/**
 * Creates one set per topic right away, then writes the questions after the response is sent,
 * so the dialog closes at once and the list shows "Generating" until each set is ready.
 */
export async function generateQuizAction(
  contentId: ContentId,
  options: unknown,
): Promise<ActionResult<{ setIds: StudySetId[] }>> {
  const c = await getContainer();
  const deps = {
    contents: c.contents,
    chapters: c.chapters,
    segments: c.segments,
    studySets: c.studySets,
    quizzes: c.quizzes,
    llm: () => c.llm(),
  };
  const started = await startQuizGeneration(deps, { contentId, options });
  if (!started.ok) return toActionResult(started);
  const ids = started.value.map((s) => s.id);
  after(async () => {
    // One topic at a time: gentle on the subscription's rate limits. Failures are saved on the set.
    for (const id of ids) await runQuizGeneration(deps, id);
  });
  return { ok: true, value: { setIds: ids } };
}

export async function submitQuizAnswerAction(
  questionId: QuizQuestionId,
  response: unknown,
): Promise<ActionResult<SubmittedAnswer>> {
  const { quizzes, llm } = await getContainer();
  return toActionResult(await submitQuizAnswer({ quizzes, llm }, { questionId, response }));
}

export async function deleteQuizSetAction(setId: StudySetId): Promise<ActionResult<null>> {
  const { studySets, quizzes } = await getContainer();
  const r = await deleteQuizSet({ studySets, quizzes }, setId);
  return r.ok ? { ok: true, value: null } : toActionResult(r);
}
