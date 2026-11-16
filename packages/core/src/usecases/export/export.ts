import type {
  ContentRepository,
  FlashcardRepository,
  NoteRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { ContentId, StudySetId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { flashcardsToAnkiCsv } from "./csv";
import { contentToMarkdown, slugify } from "./markdown";

export interface ExportFile {
  filename: string;
  mime: string;
  body: string;
}

/** Notes and ready summaries of a content as `<title>.md`. */
export async function exportContentMarkdown(
  deps: { contents: ContentRepository; notes: NoteRepository; studySets: StudySetRepository },
  contentId: ContentId,
): Promise<Result<ExportFile>> {
  const content = await deps.contents.get(contentId);
  if (!content) return err(appError("not_found", "That content no longer exists."));
  const [note, sets] = await Promise.all([
    deps.notes.get(contentId),
    deps.studySets.listByContent(contentId, "summary"),
  ]);
  const summaries = sets
    .filter((s) => s.status === "ready" && s.body?.trim())
    .map((s) => ({ title: s.title, body: s.body ?? "" }));
  if (!note?.markdown.trim() && summaries.length === 0) {
    return err(appError("validation", "There are no notes or summaries to export yet."));
  }
  return ok({
    filename: `${slugify(content.title)}.md`,
    mime: "text/markdown; charset=utf-8",
    body: contentToMarkdown({
      title: content.title,
      sourceUrl: content.sourceUrl,
      notes: note?.markdown ?? null,
      summaries,
    }),
  });
}

/** A flashcard set as an Anki-importable CSV. */
export async function exportFlashcardsCsv(
  deps: { studySets: StudySetRepository; flashcards: FlashcardRepository },
  setId: StudySetId,
): Promise<Result<ExportFile>> {
  const set = await deps.studySets.get(setId);
  if (!set || set.kind !== "flashcards") {
    return err(appError("not_found", "That flashcard set no longer exists."));
  }
  const cards = await deps.flashcards.listBySet(setId);
  if (cards.length === 0) return err(appError("validation", "This set has no cards yet."));
  return ok({
    filename: `${slugify(set.title, "flashcards")}.csv`,
    mime: "text/csv; charset=utf-8",
    body: flashcardsToAnkiCsv(cards),
  });
}

/** Every ready flashcard set of a content in one Anki CSV (what the palette exports). */
export async function exportContentFlashcardsCsv(
  deps: {
    contents: ContentRepository;
    studySets: StudySetRepository;
    flashcards: FlashcardRepository;
  },
  contentId: ContentId,
): Promise<Result<ExportFile>> {
  const content = await deps.contents.get(contentId);
  if (!content) return err(appError("not_found", "That content no longer exists."));
  const sets = (await deps.studySets.listByContent(contentId, "flashcards")).filter(
    (s) => s.status === "ready",
  );
  const cards = (await Promise.all(sets.map((s) => deps.flashcards.listBySet(s.id)))).flat();
  if (cards.length === 0) {
    return err(appError("validation", "There are no flashcards to export yet."));
  }
  return ok({
    filename: `${slugify(content.title)}-flashcards.csv`,
    mime: "text/csv; charset=utf-8",
    body: flashcardsToAnkiCsv(cards),
  });
}
