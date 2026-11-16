import { type ContentId, exportContentFlashcardsCsv } from "@thoth/core";
import { downloadResponse } from "@/features/export/download-response";
import { getContainer } from "@/server/container";

/** GET /api/export/content/[id]/flashcards: every ready flashcard set of a content, Anki CSV. */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/content/[id]/flashcards">) {
  const { id } = await ctx.params;
  return downloadResponse(await exportContentFlashcardsCsv(await getContainer(), id as ContentId));
}
