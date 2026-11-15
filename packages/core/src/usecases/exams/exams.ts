import type { Chapter, Locator, Segment } from "../../domain/content";
import {
  type ExamOptions,
  type ExamQuestionView,
  type ExamSession,
  examOptionsSchema,
  toExamQuestionView,
} from "../../domain/exam";
import type { NewQuizQuestion, QuizAttempt, QuizQuestion } from "../../domain/quiz";
import type { StudySet } from "../../domain/study-set";
import type { LlmProvider } from "../../ports/llm";
import type {
  ChapterRepository,
  ContentRepository,
  ExamSessionRepository,
  QuizRepository,
  SegmentRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { ContentId, ExamSessionId, SpaceId, StudySetId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { toNewQuestions } from "../quiz/generate-quiz";
import { gradeFreeResponse, gradeObjective } from "../quiz/grading";
import { quizSystemPrompt } from "../quiz/prompts";
import { generatedQuizSchema, quizResponseSchema } from "../quiz/schemas";
import { renderSourceText } from "../quiz/source";
import { allocateQuestions, chapterAt, sampleAcrossChapters } from "./sampling";

export interface ExamDeps {
  contents: ContentRepository;
  chapters: ChapterRepository;
  segments: SegmentRepository;
  studySets: StudySetRepository;
  quizzes: QuizRepository;
  examSessions: ExamSessionRepository;
  llm: () => Promise<LlmProvider>;
}

/* ---------------- Generation (ADR-0016 pattern) ---------------- */

/** Step 1 (fast): validates options against the space and creates a "generating" exam set. */
export async function startExamGeneration(
  deps: Pick<ExamDeps, "contents" | "studySets">,
  input: { spaceId: SpaceId; options: unknown },
): Promise<Result<StudySet>> {
  const parsed = examOptionsSchema.safeParse(input.options);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid options."));
  }
  const options = parsed.data;
  const inSpace = await deps.contents.listBySpace(input.spaceId);
  for (const id of options.contentIds) {
    const c = inSpace.find((x) => x.id === id);
    if (!c) return err(appError("validation", "Pick contents from this space only."));
    if (c.status !== "ready") {
      return err(appError("validation", `Wait until "${c.title}" has finished processing.`));
    }
  }
  const n = (await deps.studySets.listBySpace(input.spaceId, "exam")).length + 1;
  const set = await deps.studySets.create({
    kind: "exam",
    contentId: null,
    spaceId: input.spaceId,
    title: `Exam ${n}`,
    options,
    status: "generating",
  });
  return ok(set);
}

const EXAM_FOCUS =
  "This is a timed exam. Spread the questions across all parts of the SOURCE and favour questions that test understanding over recall.";

/** Step 2 (slow): one model call per content, then all questions are stored at once. */
export async function runExamGeneration(
  deps: ExamDeps,
  setId: StudySetId,
): Promise<Result<StudySet>> {
  const set = await deps.studySets.get(setId);
  if (!set || set.kind !== "exam") return err(appError("not_found", "This exam no longer exists."));
  const fail = async (message: string) => {
    await deps.studySets.update(setId, { status: "failed", error: message });
    return err(appError("llm_bad_output", message));
  };
  const parsed = examOptionsSchema.safeParse(set.options);
  if (!parsed.success) return fail("The saved exam options are invalid.");
  const options: ExamOptions = parsed.data;

  type Source = {
    contentId: ContentId;
    title: string;
    chapters: Chapter[];
    sampled: Segment[];
    size: number;
  };
  const sources: Source[] = [];
  for (const id of options.contentIds as ContentId[]) {
    const content = await deps.contents.get(id);
    if (!content) continue;
    const [chapters, segments] = await Promise.all([
      deps.chapters.listByContent(id),
      deps.segments.listByContent(id),
    ]);
    if (segments.length === 0) continue;
    sources.push({
      contentId: id,
      title: content.title,
      chapters,
      sampled: sampleAcrossChapters(chapters, segments),
      size: segments.reduce((n, s) => n + s.text.length, 0),
    });
  }
  if (sources.length === 0)
    return fail("The chosen contents have no text to write questions from.");

  const counts = allocateQuestions(
    sources.map((s) => s.size),
    options.count,
  );
  const llm = await deps.llm();
  const all: NewQuizQuestion[] = [];
  for (const [i, src] of sources.entries()) {
    const count = counts[i] ?? 1;
    const r = await llm.generateObject(
      {
        task: "quiz",
        system: quizSystemPrompt({
          topic: src.title,
          types: options.types,
          difficulty: options.difficulty,
          count,
          focus: EXAM_FOCUS,
          language: options.language,
        }),
        context: renderSourceText(src.sampled),
        messages: [{ role: "user", content: `Write ${count} exam questions from the SOURCE.` }],
      },
      generatedQuizSchema,
    );
    if (!r.ok) return fail(`Could not write questions for "${src.title}": ${r.error.message}`);
    for (const q of toNewQuestions(
      r.value.questions,
      { ...options, count },
      src.title,
      src.sampled,
    )) {
      all.push({
        ...q,
        idx: all.length,
        contentId: src.contentId,
        topic: topicFor(q.locator, src),
      });
    }
  }
  if (all.length === 0)
    return fail("The model wrote no questions of the types you asked for. Try again.");

  await deps.quizzes.addQuestions(setId, all);
  await deps.studySets.update(setId, { status: "ready", error: null });
  return ok({ ...set, status: "ready", error: null });
}

/** The chapter title the cited segment falls in, else the content title. */
function topicFor(
  locator: Locator | null,
  src: { title: string; chapters: Chapter[]; sampled: Segment[] },
): string {
  if (!locator) return src.title;
  const seg = src.sampled.find((s) => JSON.stringify(s.locator) === JSON.stringify(locator));
  return chapterAt(src.chapters, seg)?.title ?? src.title;
}

/* ---------------- Sitting an exam ---------------- */

export interface ExamSitting {
  set: StudySet;
  options: ExamOptions;
  session: ExamSession;
  questions: ExamQuestionView[];
}

async function readyExam(deps: Pick<ExamDeps, "studySets">, setId: StudySetId) {
  const set = await deps.studySets.get(setId);
  if (!set || set.kind !== "exam") return err(appError("not_found", "This exam no longer exists."));
  if (set.status !== "ready") return err(appError("validation", "This exam is not ready yet."));
  const options = examOptionsSchema.safeParse(set.options);
  if (!options.success) return err(appError("validation", "The saved exam options are invalid."));
  return ok({ set, options: options.data });
}

/** Resumes the open, unexpired sitting, or starts a new one with a fresh deadline. */
export async function startExam(
  deps: Pick<ExamDeps, "studySets" | "examSessions" | "quizzes">,
  setId: StudySetId,
  now: Date,
): Promise<Result<ExamSitting>> {
  const exam = await readyExam(deps, setId);
  if (!exam.ok) return exam;
  const sessions = await deps.examSessions.listBySet(setId);
  const open = sessions.find((s) => !s.submittedAt && s.deadlineAt.getTime() > now.getTime());
  const session =
    open ??
    (await deps.examSessions.start(
      setId,
      now,
      new Date(now.getTime() + exam.value.options.durationMin * 60_000),
    ));
  const questions = (await deps.quizzes.listQuestions(setId)).map(toExamQuestionView);
  return ok({ ...exam.value, session, questions });
}

/** Seconds of grace after the deadline before a submit is recorded as late. */
export const LATE_GRACE_MS = 60_000;

/** Grades every answered question, stores attempts and the session score. Idempotent. */
export async function submitExam(
  deps: Pick<ExamDeps, "studySets" | "examSessions" | "quizzes" | "llm">,
  input: { sessionId: ExamSessionId; responses: Record<string, unknown> },
  now: Date,
): Promise<Result<ExamResult>> {
  const session = await deps.examSessions.get(input.sessionId);
  if (!session) return err(appError("not_found", "This exam sitting no longer exists."));
  if (session.submittedAt) return getExamResult(deps, session.id);

  const questions = await deps.quizzes.listQuestions(session.setId);
  let total = 0;
  let llm: LlmProvider | null = null;
  for (const q of questions) {
    const parsed = quizResponseSchema.safeParse(input.responses[q.id]);
    if (!parsed.success) continue; // unanswered: 0 points, no attempt
    let grade = gradeObjective(q.answer, parsed.data);
    if (!grade && q.answer.type === "free_response" && parsed.data.type === "free_response") {
      if (!parsed.data.text.trim()) continue;
      llm ??= await deps.llm();
      const r = await gradeFreeResponse(llm, q, q.answer.rubric, parsed.data.text);
      grade = r.ok
        ? r.value
        : { correct: false, score: 0, feedback: "We could not grade this answer." };
    }
    if (!grade) continue;
    await deps.quizzes.addAttempt({
      questionId: q.id,
      response: parsed.data,
      correct: grade.correct,
      score: grade.score,
      feedback: grade.feedback,
    });
    total += grade.score;
  }
  const score = questions.length ? total / questions.length : 0;
  await deps.examSessions.submit(session.id, now, score);
  return getExamResult(deps, session.id);
}

/* ---------------- Results ---------------- */

export interface ExamResultItem {
  question: QuizQuestion;
  attempt: QuizAttempt | null;
}

export interface ExamTopicResult {
  contentId: ContentId | null;
  topic: string;
  /** Mean score with unanswered questions counted as 0. */
  score: number;
  questions: number;
}

export interface ExamResult {
  set: StudySet;
  session: ExamSession;
  /** True when submitted more than LATE_GRACE_MS after the deadline. */
  late: boolean;
  items: ExamResultItem[];
  topics: ExamTopicResult[];
}

export async function getExamResult(
  deps: Pick<ExamDeps, "studySets" | "examSessions" | "quizzes">,
  sessionId: ExamSessionId,
): Promise<Result<ExamResult>> {
  const session = await deps.examSessions.get(sessionId);
  if (!session) return err(appError("not_found", "This exam sitting no longer exists."));
  if (!session.submittedAt) return err(appError("validation", "This exam has not been submitted."));
  const set = await deps.studySets.get(session.setId);
  if (!set) return err(appError("not_found", "This exam no longer exists."));

  const [questions, attempts] = await Promise.all([
    deps.quizzes.listQuestions(session.setId),
    deps.quizzes.listAttempts(session.setId),
  ]);
  const from = session.startedAt.getTime();
  const to = session.submittedAt.getTime() + 5_000;
  const mine = new Map<string, QuizAttempt>();
  for (const a of attempts) {
    const t = a.createdAt.getTime();
    if (t >= from && t <= to) mine.set(a.questionId, a);
  }
  const items = questions.map((question) => ({ question, attempt: mine.get(question.id) ?? null }));

  const groups = new Map<string, ExamTopicResult & { sum: number }>();
  for (const { question, attempt } of items) {
    const key = `${question.contentId ?? ""}::${question.topic}`;
    const g = groups.get(key) ?? {
      contentId: question.contentId,
      topic: question.topic,
      score: 0,
      questions: 0,
      sum: 0,
    };
    g.sum += attempt?.score ?? 0;
    g.questions += 1;
    groups.set(key, g);
  }
  const topics = [...groups.values()]
    .map(({ sum, ...g }) => ({ ...g, score: sum / g.questions }))
    .sort((a, b) => a.score - b.score || a.topic.localeCompare(b.topic));

  const late = session.submittedAt.getTime() > session.deadlineAt.getTime() + LATE_GRACE_MS;
  return ok({ set, session, late, items, topics });
}
