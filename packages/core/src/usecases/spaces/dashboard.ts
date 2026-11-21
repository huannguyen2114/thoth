import type { Content } from "../../domain/content";
import type { Space } from "../../domain/space";
import type { PlanRepository } from "../../ports/repositories";
import type { ContentId, PlanId, SpaceId, StudySetId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { getProgress, type ProgressDeps, type TopicProgress } from "../exams/progress";
import { localDay } from "../insights/days";
import { getHistory, type HistoryDeps, type HistoryItem } from "../insights/history";
import { getToday, type TodayItem } from "../planner/planner";

/**
 * The space dashboard (doc 22): one read that answers "what should I do in this space now?".
 * Everything is computed on read from existing data; nothing here is stored.
 */
export type SpaceDashboardDeps = ProgressDeps &
  Omit<HistoryDeps, "contents" | "studySets" | "quizzes" | "flashcards"> & {
    plans: PlanRepository;
  };

export interface DueSet {
  setId: StudySetId;
  title: string;
  contentId: ContentId;
  contentTitle: string;
  due: number;
  total: number;
}

export interface SpaceDashboard {
  space: Space;
  contents: { total: number; ready: number; processing: number };
  progress: {
    answered: number;
    /** Mean latest score, 0..1, or null before any answer. */
    accuracy: number | null;
    /** Weakest first, at most five. */
    weak: TopicProgress[];
  };
  cards: { due: number; sets: DueSet[] };
  /** Today's planner tasks from plans that target this space. */
  today: { day: string; items: TodayItem[] };
  /** The nearest plan goal (an exam date) for this space that has not passed. */
  countdown: { planId: PlanId; title: string; goalDate: string; daysLeft: number } | null;
  /** Newest first, at most eight. */
  recent: HistoryItem[];
  /** "Continue where you left off": the content last studied here, else the first unopened one. */
  resume: { contentId: ContentId; title: string; href: string; reason: "recent" | "start" } | null;
}

export interface DashboardClock {
  now: Date;
  /** The browser's `Date#getTimezoneOffset()`. */
  tzOffsetMin: number;
}

const HISTORY_SCAN = 300;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export async function getSpaceDashboard(
  deps: SpaceDashboardDeps,
  spaceId: SpaceId,
  clock: DashboardClock,
): Promise<Result<SpaceDashboard>> {
  const space = await deps.spaces.get(spaceId);
  if (!space) return err(appError("not_found", "This space no longer exists."));
  const contents = await deps.contents.listBySpace(spaceId);
  const inSpace = new Map<string, Content>(contents.map((c) => [c.id, c]));

  const [progress, cards, today, plans, history] = await Promise.all([
    getProgress(deps, clock.now, { spaceId }),
    dueSets(deps, contents, clock.now),
    getToday(deps, clock),
    deps.plans.list(),
    getHistory(deps, { limit: HISTORY_SCAN, tzOffsetMin: clock.tzOffsetMin }),
  ]);

  const day = localDay(clock.now, clock.tzOffsetMin);
  const goal = plans
    .filter((p) => p.spaceId === spaceId && p.goalDate >= day)
    .sort((a, b) => a.goalDate.localeCompare(b.goalDate))[0];

  // History links each event to a page; keep the ones that land in this space.
  const spacePath = `/spaces/${spaceId}`;
  const contentOf = (href: string | null): ContentId | null => {
    const m = href ? /^\/content\/([^/?#]+)/.exec(href) : null;
    return m?.[1] && inSpace.has(m[1]) ? (m[1] as ContentId) : null;
  };
  const recent = history
    .flatMap((d) => d.items)
    .filter((i) => contentOf(i.href) !== null || i.href?.startsWith(spacePath));

  const lastStudied = recent.map((i) => contentOf(i.href)).find((id) => id !== null);
  const touched = new Set(recent.map((i) => contentOf(i.href)));
  const firstNew = contents.find((c) => c.status === "ready" && !touched.has(c.id));
  const resumeContent = lastStudied ? inSpace.get(lastStudied) : firstNew;

  return ok({
    space,
    contents: {
      total: contents.length,
      ready: contents.filter((c) => c.status === "ready").length,
      processing: contents.filter((c) => c.status === "pending" || c.status === "processing")
        .length,
    },
    progress: {
      answered: progress.answered,
      accuracy: progress.accuracy,
      weak: progress.weak.slice(0, 5),
    },
    cards,
    today: { day: today.day, items: today.items.filter((i) => i.planSpaceId === spaceId) },
    countdown: goal
      ? {
          planId: goal.id,
          title: goal.title,
          goalDate: goal.goalDate,
          daysLeft: daysBetween(day, goal.goalDate),
        }
      : null,
    recent: recent.slice(0, 8),
    resume: resumeContent
      ? {
          contentId: resumeContent.id,
          title: resumeContent.title,
          href: `/content/${resumeContent.id}`,
          reason: lastStudied ? "recent" : "start",
        }
      : null,
  });
}

/** The flashcard sets of the space's contents that have cards due now, most due first. */
async function dueSets(
  deps: Pick<ProgressDeps, "studySets" | "flashcards">,
  contents: readonly Content[],
  now: Date,
): Promise<SpaceDashboard["cards"]> {
  const sets: DueSet[] = [];
  for (const c of contents) {
    for (const set of await deps.studySets.listByContent(c.id, "flashcards")) {
      if (set.status !== "ready") continue;
      const cards = await deps.flashcards.listBySet(set.id);
      const due = cards.filter((card) => card.fsrs.due.getTime() <= now.getTime()).length;
      if (due > 0) {
        sets.push({
          setId: set.id,
          title: set.title,
          contentId: c.id,
          contentTitle: c.title,
          due,
          total: cards.length,
        });
      }
    }
  }
  sets.sort((a, b) => b.due - a.due || a.title.localeCompare(b.title));
  return { due: sets.reduce((n, s) => n + s.due, 0), sets };
}
