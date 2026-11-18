import type { Chapter, Locator, Segment } from "../../domain/content";
import { type PlanInput, type PlanItem, planInputSchema, type StudyPlan } from "../../domain/plan";
import type {
  ActivityRepository,
  ChapterRepository,
  ContentRepository,
  FlashcardRepository,
  PlanRepository,
  QuizRepository,
  SegmentRepository,
  SpaceRepository,
  StudySetRepository,
} from "../../ports/repositories";
import type { ContentId, PlanId, PlanItemId, SpaceId } from "../../shared/id";
import { appError, err, ok, type Result } from "../../shared/result";
import { recordActivity } from "../activity";
import { getProgress } from "../exams/progress";
import { addDays, localDay } from "../insights/days";
import { type BuiltPlan, buildPlan, type PlanChapter, type Shortfall } from "./build-plan";

export interface PlannerDeps {
  plans: PlanRepository;
  contents: ContentRepository;
  chapters: ChapterRepository;
  segments: SegmentRepository;
  flashcards: FlashcardRepository;
  spaces: SpaceRepository;
  studySets: StudySetRepository;
  quizzes: QuizRepository;
  activity?: ActivityRepository;
}

/** The caller's clock: `tzOffsetMin` is the browser's `Date#getTimezoneOffset()`. */
export interface PlannerClock {
  now: Date;
  tzOffsetMin: number;
}

/** A goal further out than this is almost certainly a typo. */
export const MAX_PLAN_DAYS = 366;

const sortKey = (l: Locator): { type: Locator["type"]; at: number } =>
  l.type === "page"
    ? { type: "page", at: l.page }
    : l.type === "time"
      ? { type: "time", at: l.startSec }
      : { type: "offset", at: l.start };

/**
 * Characters of source text per chapter. A chapter runs from its own start to the next
 * chapter's start (same locator type); when the locators do not line up, the text is split evenly.
 */
export function chapterSizes(chapters: readonly Chapter[], segments: readonly Segment[]): number[] {
  const total = segments.reduce((n, s) => n + s.text.length, 0);
  const even = chapters.map(() => Math.round(total / Math.max(1, chapters.length)));
  const keys = chapters.map((c) => sortKey(c.locator));
  const type = keys[0]?.type;
  if (!type || keys.some((k) => k.type !== type)) return even;
  const sizes = keys.map((k, i) => {
    const end = keys[i + 1]?.at ?? Number.POSITIVE_INFINITY;
    return segments
      .filter((s) => {
        const sk = sortKey(s.locator);
        return sk.type === type && sk.at >= k.at && sk.at < end;
      })
      .reduce((n, s) => n + s.text.length, 0);
  });
  return sizes.reduce((a, b) => a + b, 0) > 0 ? sizes : even;
}

async function planChapters(deps: PlannerDeps, contentIds: ContentId[]): Promise<PlanChapter[]> {
  const out: PlanChapter[] = [];
  for (const id of contentIds) {
    const content = await deps.contents.get(id);
    if (!content) continue;
    const [chapters, segments] = await Promise.all([
      deps.chapters.listByContent(id),
      deps.segments.listByContent(id),
    ]);
    if (chapters.length === 0) {
      const chars = segments.reduce((n, s) => n + s.text.length, 0);
      out.push({ contentId: id, contentTitle: content.title, title: content.title, chars });
      continue;
    }
    const sizes = chapterSizes(chapters, segments);
    for (const [i, c] of chapters.entries()) {
      out.push({
        contentId: id,
        contentTitle: content.title,
        title: c.title,
        chars: sizes[i] ?? 0,
      });
    }
  }
  return out;
}

/** Flashcards by the local day they fall due; the overdue ones count on `today`. */
async function cardsDueByDay(
  deps: PlannerDeps,
  clock: PlannerClock,
  today: string,
  lastDay: string,
): Promise<Record<string, number>> {
  const horizon = new Date(clock.now.getTime() + (MAX_PLAN_DAYS + 2) * 86_400_000);
  const cards = await deps.flashcards.listDue(horizon, 20_000);
  const out: Record<string, number> = {};
  for (const card of cards) {
    const due = localDay(card.fsrs.due, clock.tzOffsetMin);
    const day = due < today ? today : due;
    if (day > lastDay) continue;
    out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}

async function build(
  deps: PlannerDeps,
  plan: StudyPlan,
  clock: PlannerClock,
  done: PlanItem[],
  overrides: { minutesPerDay?: number } = {},
): Promise<BuiltPlan> {
  const today = localDay(clock.now, clock.tzOffsetMin);
  const [chapters, progress, cardsDue] = await Promise.all([
    planChapters(deps, plan.contentIds),
    getProgress(deps, clock.now),
    cardsDueByDay(deps, clock, today, plan.goalDate),
  ]);
  const inPlan = new Set<string>(plan.contentIds);
  return buildPlan({
    today,
    goalDate: plan.goalDate,
    minutesPerDay: overrides.minutesPerDay ?? plan.minutesPerDay,
    studyDays: plan.studyDays,
    chapters,
    weak: progress.weak.filter((t) => inPlan.has(t.contentId)),
    cardsDue,
    done,
  });
}

export interface PlanWithItems {
  plan: StudyPlan;
  items: PlanItem[];
  /** Set when the work does not fit before the goal. */
  shortfall: Shortfall | null;
}

/** Validates, schedules from today and saves a new plan. */
export async function createPlan(
  deps: PlannerDeps,
  input: PlanInput,
  clock: PlannerClock,
): Promise<Result<PlanWithItems>> {
  const parsed = planInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid input."));
  }
  const data = parsed.data;
  const today = localDay(clock.now, clock.tzOffsetMin);
  if (data.goalDate <= today) return err(appError("validation", "Pick a goal date after today."));
  if (data.goalDate > addDays(today, MAX_PLAN_DAYS)) {
    return err(appError("validation", "Pick a goal date within a year."));
  }
  const contentIds = [...new Set(data.contentIds)] as ContentId[];
  for (const id of contentIds) {
    if (!(await deps.contents.get(id))) {
      return err(appError("not_found", "One of the chosen contents no longer exists."));
    }
  }
  if (data.spaceId && !(await deps.spaces.get(data.spaceId as SpaceId))) {
    return err(appError("not_found", "That space no longer exists."));
  }
  const plan = await deps.plans.create({
    title: data.title,
    goalDate: data.goalDate,
    minutesPerDay: data.minutesPerDay,
    studyDays: [...new Set(data.studyDays)].sort(),
    spaceId: data.spaceId as SpaceId | null,
    contentIds,
  });
  const built = await build(deps, plan, clock, []);
  const items = await deps.plans.replaceOpenItems(plan.id, built.items);
  return ok({ plan, items, shortfall: built.shortfall });
}

/** Reschedules the unfinished work from today, keeping finished items and using the current weak topics. */
export async function replan(
  deps: PlannerDeps,
  planId: PlanId,
  clock: PlannerClock,
  settings?: { minutesPerDay?: number },
): Promise<Result<PlanWithItems>> {
  let plan = await deps.plans.get(planId);
  if (!plan) return err(appError("not_found", "That plan no longer exists."));
  if (settings?.minutesPerDay !== undefined) {
    const m = planInputSchema.shape.minutesPerDay.safeParse(settings.minutesPerDay);
    if (!m.success) return err(appError("validation", m.error.issues[0]?.message ?? "Invalid."));
    await deps.plans.update(planId, { minutesPerDay: m.data });
    plan = { ...plan, minutesPerDay: m.data };
  }
  const today = localDay(clock.now, clock.tzOffsetMin);
  if (plan.goalDate <= today) {
    return err(appError("validation", "The goal date has passed. Make a new plan."));
  }
  const done = (await deps.plans.listItems(planId)).filter((i) => i.doneAt !== null);
  const built = await build(deps, plan, clock, done);
  await deps.plans.replaceOpenItems(planId, built.items);
  return ok({ plan, items: await deps.plans.listItems(planId), shortfall: built.shortfall });
}

export interface PlanOverview {
  plan: StudyPlan;
  doneMinutes: number;
  totalMinutes: number;
  doneItems: number;
  totalItems: number;
  /** Whole days from today to the goal (negative once it has passed). */
  daysLeft: number;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export async function listPlans(deps: PlannerDeps, clock: PlannerClock): Promise<PlanOverview[]> {
  const today = localDay(clock.now, clock.tzOffsetMin);
  const out: PlanOverview[] = [];
  for (const plan of await deps.plans.list()) {
    const items = await deps.plans.listItems(plan.id);
    const done = items.filter((i) => i.doneAt);
    out.push({
      plan,
      doneMinutes: done.reduce((n, i) => n + i.minutes, 0),
      totalMinutes: items.reduce((n, i) => n + i.minutes, 0),
      doneItems: done.length,
      totalItems: items.length,
      daysLeft: daysBetween(today, plan.goalDate),
    });
  }
  return out;
}

export interface PlanView extends PlanOverview {
  items: PlanItem[];
  /** Content titles by id, for the item rows. */
  contentTitles: Record<string, string>;
  /** What re-planning from today would say: set when the remaining work no longer fits. */
  shortfall: Shortfall | null;
}

export async function getPlanView(
  deps: PlannerDeps,
  planId: PlanId,
  clock: PlannerClock,
): Promise<Result<PlanView>> {
  const plan = await deps.plans.get(planId);
  if (!plan) return err(appError("not_found", "That plan no longer exists."));
  const items = await deps.plans.listItems(planId);
  const today = localDay(clock.now, clock.tzOffsetMin);
  const done = items.filter((i) => i.doneAt !== null);
  const contentTitles: Record<string, string> = {};
  for (const id of plan.contentIds) {
    const c = await deps.contents.get(id);
    if (c) contentTitles[id] = c.title;
  }
  const shortfall = plan.goalDate > today ? (await build(deps, plan, clock, done)).shortfall : null;
  return ok({
    plan,
    items,
    contentTitles,
    shortfall,
    doneMinutes: done.reduce((n, i) => n + i.minutes, 0),
    totalMinutes: items.reduce((n, i) => n + i.minutes, 0),
    doneItems: done.length,
    totalItems: items.length,
    daysLeft: daysBetween(today, plan.goalDate),
  });
}

export interface TodayItem extends PlanItem {
  planTitle: string;
  planSpaceId: SpaceId | null;
}

/** Today's items across every plan whose goal has not passed, plus work missed on earlier days. */
export async function getToday(
  deps: Pick<PlannerDeps, "plans">,
  clock: PlannerClock,
): Promise<{ day: string; items: TodayItem[]; missed: number }> {
  const day = localDay(clock.now, clock.tzOffsetMin);
  const plans = await deps.plans.list();
  const byId = new Map(plans.map((p) => [p.id, p]));
  const items: TodayItem[] = [];
  for (const i of await deps.plans.listItemsForDay(day)) {
    const p = byId.get(i.planId);
    if (p) items.push({ ...i, planTitle: p.title, planSpaceId: p.spaceId });
  }
  let missed = 0;
  for (const p of plans) {
    if (p.goalDate < day) continue;
    missed += (await deps.plans.listItems(p.id)).filter(
      (i) => i.day < day && i.doneAt === null && i.kind !== "rest",
    ).length;
  }
  return { day, items, missed };
}

/** Ticks or unticks an item. Finishing one records `plan_item_done` for the habit tracker (ADR-0023). */
export async function setItemDone(
  deps: Pick<PlannerDeps, "plans" | "activity">,
  input: { planId: PlanId; itemId: PlanItemId; done: boolean },
  now: Date,
): Promise<Result<PlanItem>> {
  const item = (await deps.plans.listItems(input.planId)).find((i) => i.id === input.itemId);
  if (!item) return err(appError("not_found", "That task no longer exists."));
  const doneAt = input.done ? now : null;
  await deps.plans.setDone(item.id, doneAt);
  if (input.done && !item.doneAt)
    await recordActivity(deps.activity, "plan_item_done", item.id, now);
  return ok({ ...item, doneAt });
}

export interface ItemPatch {
  title?: string;
  minutes?: number;
  day?: string;
}

/** Changes an item's title, minutes or day. */
export async function editItem(
  deps: Pick<PlannerDeps, "plans">,
  input: { planId: PlanId; itemId: PlanItemId; patch: ItemPatch },
): Promise<Result<PlanItem>> {
  const item = (await deps.plans.listItems(input.planId)).find((i) => i.id === input.itemId);
  if (!item) return err(appError("not_found", "That task no longer exists."));
  const { title, minutes, day } = input.patch;
  const patch: ItemPatch = {};
  if (title !== undefined) {
    if (!title.trim()) return err(appError("validation", "Give the task a name."));
    patch.title = title.trim().slice(0, 200);
  }
  if (minutes !== undefined) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 600) {
      return err(appError("validation", "Minutes must be between 0 and 600."));
    }
    patch.minutes = minutes;
  }
  if (day !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
      return err(appError("validation", "Pick a valid day."));
    }
    patch.day = day;
  }
  await deps.plans.updateItem(item.id, patch);
  return ok({ ...item, ...patch });
}

export async function deletePlan(deps: Pick<PlannerDeps, "plans">, planId: PlanId): Promise<void> {
  await deps.plans.delete(planId);
}
