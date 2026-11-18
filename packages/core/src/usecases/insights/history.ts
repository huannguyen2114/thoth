import type { ActivityEvent, ActivityKind } from "../../domain/activity";
import type {
  ActivityRepository,
  ChatRepository,
  ContentRepository,
  ExamSessionRepository,
  FlashcardRepository,
  QuizRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type {
  ChatId,
  ContentId,
  ExamSessionId,
  FlashcardId,
  QuizQuestionId,
  SpaceId,
  StudySetId,
} from "../../shared/id";
import { localDay } from "./days";

export interface HistoryItem {
  id: string;
  kind: ActivityKind;
  at: Date;
  /** Human label: "Answered a quiz question". */
  label: string;
  /** What it was about (a content title, a space name), when it can be found. */
  subject: string | null;
  /** App path to the related page, when there is one. */
  href: string | null;
}

export interface HistoryDay {
  /** Local calendar day "YYYY-MM-DD". */
  day: string;
  items: HistoryItem[];
}

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  quiz_answer: "Answered a quiz question",
  card_review: "Reviewed a flashcard",
  chat_question: "Asked a question in chat",
  note_edit: "Edited notes",
  content_added: "Added content",
  exam_submitted: "Submitted an exam",
  summary_generated: "Generated a summary",
  plan_item_done: "Finished a planned task",
  whiteboard_edit: "Worked on a whiteboard",
};

export interface HistoryDeps {
  activity: ActivityRepository;
  contents: ContentRepository;
  studySets: StudySetRepository;
  quizzes: QuizRepository;
  flashcards: FlashcardRepository;
  chats: ChatRepository;
  examSessions: ExamSessionRepository;
}

interface Target {
  subject: string | null;
  href: string | null;
}
const NONE: Target = { subject: null, href: null };

/**
 * Recent activity grouped by local day, newest first, each event linked to the page it came
 * from when its `ref` can still be resolved (deleted items simply get no link).
 */
export async function getHistory(
  deps: HistoryDeps,
  input: { limit: number; tzOffsetMin: number },
): Promise<HistoryDay[]> {
  const events = await deps.activity.listRecent(input.limit);

  // Many events share a content or set, so memoise lookups (one read per distinct id).
  const memo = new Map<string, Promise<Target>>();
  const once = (key: string, fn: () => Promise<Target>) => {
    const cached = memo.get(key);
    if (cached) return cached;
    const p = fn().catch(() => NONE);
    memo.set(key, p);
    return p;
  };
  const contentTarget = (id: ContentId, hash = "") =>
    once(`content:${id}${hash}`, async () => {
      const c = await deps.contents.get(id);
      return c ? { subject: c.title, href: `/content/${c.id}${hash}` } : NONE;
    });
  const setTarget = (id: StudySetId) =>
    once(`set:${id}`, async () => {
      const s = await deps.studySets.get(id);
      if (!s) return NONE;
      if (s.contentId) return contentTarget(s.contentId);
      if (s.spaceId) return { subject: s.title, href: `/spaces/${s.spaceId as SpaceId}` };
      return { subject: s.title, href: null };
    });

  const resolve = async (e: ActivityEvent): Promise<Target> => {
    if (!e.ref) return NONE;
    switch (e.kind) {
      case "content_added":
      case "note_edit":
        return contentTarget(e.ref as ContentId);
      case "summary_generated":
        return setTarget(e.ref as StudySetId);
      case "quiz_answer":
        return once(`q:${e.ref}`, async () => {
          const q = await deps.quizzes.getQuestion(e.ref as QuizQuestionId);
          return q ? setTarget(q.setId) : NONE;
        });
      case "card_review":
        return once(`card:${e.ref}`, async () => {
          const c = await deps.flashcards.get(e.ref as FlashcardId);
          return c ? setTarget(c.setId) : NONE;
        });
      case "exam_submitted":
        return once(`exam:${e.ref}`, async () => {
          const s = await deps.examSessions.get(e.ref as ExamSessionId);
          return s ? setTarget(s.setId) : NONE;
        });
      case "chat_question":
        // Backfilled rows hold the chat id; new rows hold the message id (no lookup for those).
        return once(`chat:${e.ref}`, async () => {
          const chat = await deps.chats.get(e.ref as ChatId);
          return chat ? contentTarget(chat.contentId) : NONE;
        });
      case "plan_item_done":
        return { subject: "Study plan", href: "/planner" };
      case "whiteboard_edit":
        // ref is the content or space the board belongs to (ADR-0031).
        return contentTarget(e.ref as ContentId);
    }
  };

  const items = await Promise.all(
    events.map(async (e): Promise<HistoryItem> => {
      const t = await resolve(e);
      return { id: e.id, kind: e.kind, at: e.at, label: ACTIVITY_LABELS[e.kind], ...t };
    }),
  );
  return groupByDay(items, input.tzOffsetMin);
}

/** Groups newest-first items by local day, keeping their order. */
export function groupByDay(items: HistoryItem[], tzOffsetMin: number): HistoryDay[] {
  const out: HistoryDay[] = [];
  for (const item of items) {
    const day = localDay(item.at, tzOffsetMin);
    const last = out.at(-1);
    if (last?.day === day) last.items.push(item);
    else out.push({ day, items: [item] });
  }
  return out;
}
