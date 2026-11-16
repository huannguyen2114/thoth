import { exportFlashcardsCsv, type StudySetId } from "@thoth/core";
import { downloadResponse } from "@/features/export/download-response";
import { getContainer } from "@/server/container";

/** GET /api/export/flashcards/[setId]: one flashcard set as an Anki-importable CSV. */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/flashcards/[setId]">) {
  const { setId } = await ctx.params;
  return downloadResponse(await exportFlashcardsCsv(await getContainer(), setId as StudySetId));
}
