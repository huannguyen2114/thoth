import type { Chapter, Segment } from "../../domain/content";
import type { NewQuizQuestion, QuizAnswer } from "../../domain/quiz";
import type { StudySet } from "../../domain/study-set";
import type { LlmProvider } from "../../ports/llm";
import type {
  ChapterRepository,
  ContentRepository,
  QuizRepository,
  SegmentRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { ContentId, StudySetId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { quizSystemPrompt, quizUserMessage } from "./prompts";
import {
  type GeneratedQuestion,
  generatedQuizSchema,
  type QuizOptions,
  quizOptionsSchema,
} from "./schemas";
import { renderSourceText, resolveCitation, segmentsForChapter } from "./source";

export interface QuizGenerationDeps {
  contents: ContentRepository;
  chapters: ChapterRepository;
  segments: SegmentRepository;
  studySets: StudySetRepository;
  quizzes: QuizRepository;
  llm: () => Promise<LlmProvider>;
}

/** A topic is one chapter, or the whole content when it has no chapters. */
interface Topic {
  chapterId: string | null;
  title: string;
}

/** Everything stored on the set so "Generate more" can repeat it. */
export type QuizSetOptions = QuizOptions & { topic: string; chapterId: string | null };

function toStored(q: GeneratedQuestion): { answer: QuizAnswer; choices: string[] | null } {
  switch (q.type) {
    case "multiple_choice":
      return { answer: { type: "multiple_choice", index: q.correctIndex }, choices: q.choices };
    case "multi_select":
      return {
        answer: { type: "multi_select", indices: [...q.correctIndices].sort((a, b) => a - b) },
        choices: q.choices,
      };
    case "true_false":
      return { answer: { type: "true_false", value: q.correct }, choices: null };
    case "fill_blank":
      return { answer: { type: "fill_blank", accepted: q.acceptedAnswers }, choices: null };
    case "free_response":
      return { answer: { type: "free_response", rubric: q.rubric }, choices: null };
  }
}

/** Keeps only requested types, caps at `count`, resolves citations into locators. */
export function toNewQuestions(
  generated: readonly GeneratedQuestion[],
  options: Pick<QuizOptions, "types" | "difficulty" | "count">,
  topic: string,
  segments: readonly Segment[],
): NewQuizQuestion[] {
  return generated
    .filter((q) => options.types.includes(q.type))
    .slice(0, options.count)
    .map((q, idx) => ({
      idx,
      type: q.type,
      difficulty: options.difficulty,
      prompt: q.prompt,
      explanation: q.explanation,
      topic,
      locator: resolveCitation(q.source, segments),
      ...toStored(q),
    }));
}

async function pickTopics(
  deps: Pick<QuizGenerationDeps, "chapters" | "contents">,
  contentId: ContentId,
  chapterIds: readonly string[],
): Promise<Result<{ topics: Topic[]; chapters: Chapter[] }>> {
  const content = await deps.contents.get(contentId);
  if (!content) return err(appError("not_found", "This content no longer exists."));
  if (content.status !== "ready") {
    return err(appError("validation", "Wait until this content has finished processing."));
  }
  const chapters = (await deps.chapters.listByContent(contentId)).sort((a, b) => a.idx - b.idx);
  if (chapters.length === 0) {
    return ok({ topics: [{ chapterId: null, title: content.title }], chapters });
  }
  const chosen = chapterIds.length ? chapters.filter((c) => chapterIds.includes(c.id)) : chapters;
  if (chosen.length === 0) return err(appError("validation", "Pick at least one topic."));
  return ok({ topics: chosen.map((c) => ({ chapterId: c.id, title: c.title })), chapters });
}

/**
 * Step 1 (fast): validates the options and creates one "generating" set per topic, titled
 * "Quiz N: {topic}". The caller then runs `runQuizGeneration` for each id, in the background.
 */
export async function startQuizGeneration(
  deps: QuizGenerationDeps,
  input: { contentId: ContentId; options: unknown },
): Promise<Result<StudySet[]>> {
  const parsed = quizOptionsSchema.safeParse(input.options);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid options."));
  }
  const options = parsed.data;
  const picked = await pickTopics(deps, input.contentId, options.chapterIds);
  if (!picked.ok) return picked;

  const existing = (await deps.studySets.listByContent(input.contentId, "quiz")).length;
  const sets: StudySet[] = [];
  for (const [i, topic] of picked.value.topics.entries()) {
    const stored: QuizSetOptions = { ...options, topic: topic.title, chapterId: topic.chapterId };
    sets.push(
      await deps.studySets.create({
        kind: "quiz",
        contentId: input.contentId,
        spaceId: null,
        title: `Quiz ${existing + i + 1}: ${topic.title}`,
        options: stored,
        status: "generating",
      }),
    );
  }
  return ok(sets);
}

/** Step 2 (slow): asks the model, stores the questions, and marks the set ready or failed. */
export async function runQuizGeneration(
  deps: QuizGenerationDeps,
  setId: StudySetId,
): Promise<Result<StudySet>> {
  const set = await deps.studySets.get(setId);
  if (!set || set.kind !== "quiz" || !set.contentId) {
    return err(appError("not_found", "This quiz no longer exists."));
  }
  const fail = async (message: string, code: "llm_bad_output" | "not_found" | "validation") => {
    await deps.studySets.update(setId, { status: "failed", error: message });
    return err(appError(code, message));
  };

  const stored = set.options as unknown as QuizSetOptions;
  const options = quizOptionsSchema.safeParse(stored);
  if (!options.success) return fail("The saved quiz options are invalid.", "validation");
  const [chapters, all] = await Promise.all([
    deps.chapters.listByContent(set.contentId),
    deps.segments.listByContent(set.contentId),
  ]);
  const chapter = chapters.find((c) => c.id === stored.chapterId);
  const sorted = [...chapters].sort((a, b) => a.idx - b.idx);
  const segments = chapter ? segmentsForChapter(chapter, sorted, all) : all;
  if (segments.length === 0)
    return fail("This topic has no text to write questions from.", "not_found");

  const llm = await deps.llm();
  const r = await llm.generateObject(
    {
      task: "quiz",
      system: quizSystemPrompt({ ...options.data, topic: stored.topic }),
      context: renderSourceText(segments),
      messages: [{ role: "user", content: quizUserMessage(stored.topic, options.data.count) }],
    },
    generatedQuizSchema,
  );
  if (!r.ok) {
    await deps.studySets.update(setId, { status: "failed", error: r.error.message });
    return r;
  }
  const questions = toNewQuestions(r.value.questions, options.data, stored.topic, segments);
  if (questions.length === 0) {
    return fail(
      "The model wrote no questions of the types you asked for. Try again.",
      "llm_bad_output",
    );
  }
  await deps.quizzes.addQuestions(setId, questions);
  await deps.studySets.update(setId, { status: "ready", error: null });
  return ok({ ...set, status: "ready", error: null });
}
