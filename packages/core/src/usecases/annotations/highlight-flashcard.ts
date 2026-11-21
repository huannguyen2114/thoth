import { z } from "zod";
import type { Locator } from "../../domain/content";
import { locatorSchema } from "../../domain/content";
import type { Flashcard } from "../../domain/flashcard";
import type { StudySet } from "../../domain/study-set";
import type { LlmProvider } from "../../ports/llm";
import type {
  AnnotationRepository,
  ContentRepository,
  FlashcardRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { AnnotationId, ContentId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";

export interface HighlightFlashcardDeps {
  contents: ContentRepository;
  studySets: StudySetRepository;
  flashcards: FlashcardRepository;
  annotations?: AnnotationRepository;
  /** Needed only when a suggested question is asked for. */
  llm?: () => Promise<LlmProvider>;
  now?: () => Date;
}

/** Marks the per-content "From highlights" deck in `study_sets.options`. */
export const HIGHLIGHTS_SET_SOURCE = "highlights";
export const HIGHLIGHTS_SET_TITLE = "From highlights";
export const HIGHLIGHT_TOPIC = "Highlights";
const BLANK = "_____";

export const highlightCardInput = z.object({
  contentId: z.string().min(1),
  quote: z
    .string()
    .trim()
    .min(3, "Select a longer passage.")
    .max(2000, "Select a shorter passage."),
  locator: locatorSchema.nullable().default(null),
  comment: z.string().trim().max(4000).nullable().default(null),
  /** Ask Claude for a question instead of a cloze. */
  suggest: z.boolean().default(false),
});
export type HighlightCardInput = z.input<typeof highlightCardInput>;

const STOP = new Set(
  "about above after again against because before being below between both could does doing during each from further have having here into more most other over same should some such than that their theirs them then there these they this those through under until very were what when where which while whom with would your yours".split(
    " ",
  ),
);

/**
 * The cloze front for a passage: its most telling word blanked out. The longest word that is
 * not a common English word wins; ties go to the earliest. Pure, so it is tested directly.
 */
export function clozeOf(quote: string): { front: string; answer: string } {
  const text = quote.trim().replace(/\s+/g, " ");
  let best: { start: number; word: string } | null = null;
  for (const m of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)) {
    const word = m[0];
    if (word.length < 4 || STOP.has(word.toLowerCase())) continue;
    if (!best || word.length > best.word.length) best = { start: m.index ?? 0, word };
  }
  if (!best) return { front: `${text}\n\n${BLANK}?`, answer: text };
  return {
    front: `${text.slice(0, best.start)}${BLANK}${text.slice(best.start + best.word.length)}`,
    answer: best.word,
  };
}

const suggestedSchema = z.object({ question: z.string().trim().min(3).max(400) });

function suggestSystem(title: string): string {
  return [
    "You write one flashcard question for a student.",
    `The passage comes from "${title}".`,
    "Ask one short question whose answer is the passage's key idea. Do not quote the passage word for word.",
    'Reply with JSON only: {"question": "..."}',
  ].join("\n");
}

/** Finds the content's "From highlights" deck, or creates it (ready, with no cards yet). */
async function highlightsSet(
  deps: HighlightFlashcardDeps,
  contentId: ContentId,
): Promise<StudySet> {
  const sets = await deps.studySets.listByContent(contentId, "flashcards");
  const found = sets.find((s) => s.options?.source === HIGHLIGHTS_SET_SOURCE);
  if (found) return found;
  return deps.studySets.create({
    kind: "flashcards",
    contentId,
    spaceId: null,
    title: HIGHLIGHTS_SET_TITLE,
    options: { source: HIGHLIGHTS_SET_SOURCE, topics: [HIGHLIGHT_TOPIC], chapterIds: [] },
    status: "ready",
  });
}

export interface HighlightCardResult {
  card: Flashcard;
  set: StudySet;
  /** False when a question was asked for but Claude did not give one (the cloze was used). */
  suggested: boolean;
}

/**
 * Turns a passage into a flashcard in the content's "From highlights" deck (doc 21).
 * Front: a cloze of the quote, or a question Claude suggests (task "flashcards").
 * Back: the quote, then the comment when there is one. The card keeps the locator, so review
 * can jump back to the source like any generated card.
 */
export async function passageToFlashcard(
  deps: HighlightFlashcardDeps,
  input: HighlightCardInput | unknown,
): Promise<Result<HighlightCardResult>> {
  const parsed = highlightCardInput.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid passage."));
  }
  const p = parsed.data;
  const contentId = p.contentId as ContentId;
  const content = await deps.contents.get(contentId);
  if (!content) return err(appError("not_found", "This content no longer exists."));

  const quote = p.quote.replace(/\s+/g, " ");
  let front = clozeOf(quote).front;
  let suggested = false;
  if (p.suggest && deps.llm) {
    const llm = await deps.llm();
    const r = await llm.generateObject(
      {
        task: "flashcards",
        system: suggestSystem(content.title),
        messages: [{ role: "user", content: `Passage:\n${quote}` }],
      },
      suggestedSchema,
    );
    if (r.ok) {
      front = r.value.question;
      suggested = true;
    }
  }
  const back = p.comment ? `${quote}\n\n${p.comment}` : quote;
  const set = await highlightsSet(deps, contentId);
  const idx = (await deps.flashcards.listBySet(set.id)).length;
  const [card] = await deps.flashcards.addCards(
    set.id,
    [{ idx, front, back, topic: HIGHLIGHT_TOPIC, locator: p.locator as Locator | null }],
    (deps.now ?? (() => new Date()))(),
  );
  if (!card) throw new Error("addCards returned no card.");
  return ok({ card, set, suggested });
}

/** `passageToFlashcard` for a stored highlight: its quote, locator and comment. */
export async function highlightToFlashcard(
  deps: HighlightFlashcardDeps & { annotations: AnnotationRepository },
  annotationId: AnnotationId,
  options: { suggest?: boolean } = {},
): Promise<Result<HighlightCardResult>> {
  const a = await deps.annotations.get(annotationId);
  if (!a) return err(appError("not_found", "This highlight no longer exists."));
  const quote = a.anchor.quote?.exact ?? a.comment;
  if (!quote)
    return err(appError("validation", "This annotation has no text to make a card from."));
  return passageToFlashcard(deps, {
    contentId: a.contentId,
    quote,
    locator: a.anchor.locator,
    comment: a.anchor.quote ? a.comment : null,
    suggest: options.suggest ?? false,
  });
}
