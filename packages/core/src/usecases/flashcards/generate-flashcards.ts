import type { Chapter, Segment } from "../../domain/content";
import type { NewFlashcard } from "../../domain/flashcard";
import type { StudySet } from "../../domain/study-set";
import type { LlmProvider } from "../../ports/llm";
import type {
  ChapterRepository,
  ContentRepository,
  FlashcardRepository,
  SegmentRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { ContentId, StudySetId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { renderSourceText, resolveCitation, segmentsForChapter } from "../quiz/source";
import { flashcardsSystemPrompt, flashcardsUserMessage } from "./prompts";
import { type FlashcardOptions, flashcardOptionsSchema, generatedCardsSchema } from "./schemas";

export interface FlashcardGenerationDeps {
  contents: ContentRepository;
  chapters: ChapterRepository;
  segments: SegmentRepository;
  studySets: StudySetRepository;
  flashcards: FlashcardRepository;
  llm: () => Promise<LlmProvider>;
  now?: () => Date;
}

export type FlashcardSetOptions = FlashcardOptions & { topics: string[] };

/** Per-topic character budget so many chapters still fit in one request. */
const TOTAL_CHARS = 60_000;

/**
 * Step 1 (fast): validates the options and creates one "generating" set.
 * The caller then runs `runFlashcardGeneration` in the background.
 */
export async function startFlashcardGeneration(
  deps: FlashcardGenerationDeps,
  input: { contentId: ContentId; options: unknown },
): Promise<Result<StudySet>> {
  const parsed = flashcardOptionsSchema.safeParse(input.options);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid options."));
  }
  const options = parsed.data;
  const content = await deps.contents.get(input.contentId);
  if (!content) return err(appError("not_found", "This content no longer exists."));
  if (content.status !== "ready") {
    return err(appError("validation", "Wait until this content has finished processing."));
  }
  const chapters = await deps.chapters.listByContent(input.contentId);
  const chosen = options.chapterIds.length
    ? chapters.filter((c) => options.chapterIds.includes(c.id))
    : chapters;
  if (chapters.length > 0 && chosen.length === 0) {
    return err(appError("validation", "Pick at least one topic."));
  }
  const topics = chosen.length ? chosen.map((c) => c.title) : [content.title];
  const existing = (await deps.studySets.listByContent(input.contentId, "flashcards")).length;
  const stored: FlashcardSetOptions = { ...options, chapterIds: chosen.map((c) => c.id), topics };
  return ok(
    await deps.studySets.create({
      kind: "flashcards",
      contentId: input.contentId,
      spaceId: null,
      title: `Flashcards ${existing + 1}: ${topics.length === 1 ? topics[0] : content.title}`,
      options: stored,
      status: "generating",
    }),
  );
}

interface TopicSource {
  title: string;
  segments: Segment[];
}

function collectSources(
  stored: FlashcardSetOptions,
  chapters: Chapter[],
  all: Segment[],
): TopicSource[] {
  const sorted = [...chapters].sort((a, b) => a.idx - b.idx);
  const chosen = sorted.filter((c) => stored.chapterIds.includes(c.id));
  if (chosen.length === 0) return [{ title: stored.topics[0] ?? "Content", segments: all }];
  return chosen.map((c) => ({ title: c.title, segments: segmentsForChapter(c, sorted, all) }));
}

/** Step 2 (slow): asks the model, stores the cards (all due now), marks the set ready or failed. */
export async function runFlashcardGeneration(
  deps: FlashcardGenerationDeps,
  setId: StudySetId,
): Promise<Result<StudySet>> {
  const set = await deps.studySets.get(setId);
  if (!set || set.kind !== "flashcards" || !set.contentId) {
    return err(appError("not_found", "This flashcard set no longer exists."));
  }
  const fail = async (message: string, code: "llm_bad_output" | "not_found" | "validation") => {
    await deps.studySets.update(setId, { status: "failed", error: message });
    return err(appError(code, message));
  };
  const stored = set.options as unknown as FlashcardSetOptions;
  const parsed = flashcardOptionsSchema.safeParse(stored);
  if (!parsed.success) return fail("The saved flashcard options are invalid.", "validation");

  const [chapters, all] = await Promise.all([
    deps.chapters.listByContent(set.contentId),
    deps.segments.listByContent(set.contentId),
  ]);
  const sources = collectSources(stored, chapters, all).filter((s) => s.segments.length > 0);
  if (sources.length === 0) return fail("This topic has no text to write cards from.", "not_found");

  const budget = Math.floor(TOTAL_CHARS / sources.length);
  const context = sources
    .map((s) => `=== TOPIC: ${s.title} ===\n${renderSourceText(s.segments, budget)}`)
    .join("\n\n");
  const llm = await deps.llm();
  const r = await llm.generateObject(
    {
      task: "flashcards",
      system: flashcardsSystemPrompt({
        topics: sources.map((s) => s.title),
        count: parsed.data.count,
        focus: parsed.data.focus,
        language: parsed.data.language,
      }),
      context,
      messages: [{ role: "user", content: flashcardsUserMessage(parsed.data.count) }],
    },
    generatedCardsSchema,
  );
  if (!r.ok) {
    await deps.studySets.update(setId, { status: "failed", error: r.error.message });
    return r;
  }

  const allSegments = sources.flatMap((s) => s.segments);
  const titles = new Set(sources.map((s) => s.title));
  const fallbackTopic = sources[0]?.title ?? "General";
  const cards: NewFlashcard[] = r.value.cards.slice(0, parsed.data.count).map((c, idx) => ({
    idx,
    front: c.front,
    back: c.back,
    topic: titles.has(c.topic) ? c.topic : fallbackTopic,
    locator: resolveCitation(c.source, allSegments),
  }));
  await deps.flashcards.addCards(setId, cards, (deps.now ?? (() => new Date()))());
  await deps.studySets.update(setId, { status: "ready", error: null });
  return ok({ ...set, status: "ready", error: null });
}
