"use server";

import {
  type ContentId,
  type DueCard,
  deleteCard,
  deleteFlashcardSet,
  editCard,
  type FlashcardId,
  type FlashcardSetSummary,
  listDueCards,
  listFlashcardSets,
  listSetCards,
  type ReviewOutcome,
  type ReviewRating,
  reviewCard,
  runFlashcardGeneration,
  type StudySetId,
  startFlashcardGeneration,
} from "@thoth/core";
import { after } from "next/server";
import { type ActionResult, toActionResult } from "@/lib/action-result";
import { getContainer } from "@/server/container";

/** Thin adapters: container -> core use case -> plain result. No business rules here. */

async function deps() {
  const c = await getContainer();
  return {
    contents: c.contents,
    chapters: c.chapters,
    segments: c.segments,
    studySets: c.studySets,
    flashcards: c.flashcards,
    activity: c.activity,
    llm: () => c.llm(),
  };
}

export async function loadFlashcardSetsAction(
  contentId: ContentId,
): Promise<FlashcardSetSummary[]> {
  return listFlashcardSets(await deps(), contentId);
}

export async function loadSetCardsAction(setId: StudySetId): Promise<DueCard[]> {
  return listSetCards(await deps(), setId);
}

export async function loadDueCardsAction(): Promise<DueCard[]> {
  return listDueCards(await deps());
}

/** Creates the set at once and writes the cards after the response, like quizzes. */
export async function generateFlashcardsAction(
  contentId: ContentId,
  options: unknown,
): Promise<ActionResult<{ setId: StudySetId }>> {
  const d = await deps();
  const started = await startFlashcardGeneration(d, { contentId, options });
  if (!started.ok) return toActionResult(started);
  const id = started.value.id;
  after(async () => {
    await runFlashcardGeneration(d, id);
  });
  return { ok: true, value: { setId: id } };
}

export async function reviewCardAction(
  cardId: FlashcardId,
  rating: ReviewRating,
): Promise<ActionResult<ReviewOutcome>> {
  return toActionResult(await reviewCard(await deps(), { cardId, rating }));
}

export async function editCardAction(
  cardId: FlashcardId,
  front: string,
  back: string,
): Promise<ActionResult<null>> {
  const r = await editCard(await deps(), { cardId, front, back });
  return r.ok ? { ok: true, value: null } : toActionResult(r);
}

export async function deleteCardAction(cardId: FlashcardId): Promise<ActionResult<null>> {
  const r = await deleteCard(await deps(), cardId);
  return r.ok ? { ok: true, value: null } : toActionResult(r);
}

export async function deleteFlashcardSetAction(setId: StudySetId): Promise<ActionResult<null>> {
  const r = await deleteFlashcardSet(await deps(), setId);
  return r.ok ? { ok: true, value: null } : toActionResult(r);
}
