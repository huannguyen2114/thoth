import { describe, expect, it } from "vitest";
import type { Chapter, Content, Segment } from "../../domain/content";
import { newFsrsState } from "../../domain/flashcard";
import type { NewPlanItem, NewStudyPlan, PlanItem, StudyPlan } from "../../domain/plan";
import type { PlanRepository } from "../../ports/repositories";
import {
  type ChapterId,
  type ContentId,
  newId,
  type PlanId,
  type PlanItemId,
  type SegmentId,
} from "../../shared/id";
import {
  chapterSizes,
  createPlan,
  editItem,
  getPlanView,
  getToday,
  type PlannerDeps,
  replan,
  setItemDone,
} from "./planner";

class MemPlans implements PlanRepository {
  plans: StudyPlan[] = [];
  items: PlanItem[] = [];
  async create(p: NewStudyPlan) {
    const plan = { ...p, id: newId<PlanId>(), createdAt: new Date(0), updatedAt: new Date(0) };
    this.plans.push(plan);
    return plan;
  }
  async get(id: PlanId) {
    return this.plans.find((p) => p.id === id) ?? null;
  }
  async list() {
    return this.plans;
  }
  async update(id: PlanId, patch: Partial<NewStudyPlan>) {
    this.plans = this.plans.map((p) => (p.id === id ? { ...p, ...patch } : p));
  }
  async delete(id: PlanId) {
    this.plans = this.plans.filter((p) => p.id !== id);
  }
  async replaceOpenItems(planId: PlanId, items: NewPlanItem[]) {
    this.items = this.items.filter((i) => i.planId !== planId || i.doneAt !== null);
    const added = items.map((i) => ({ ...i, id: newId<PlanItemId>(), planId, doneAt: null }));
    this.items.push(...added);
    return added;
  }
  async listItems(planId: PlanId) {
    return this.items
      .filter((i) => i.planId === planId)
      .sort((a, b) => a.day.localeCompare(b.day) || a.idx - b.idx);
  }
  async listItemsForDay(day: string) {
    return this.items.filter((i) => i.day === day);
  }
  async setDone(id: PlanItemId, doneAt: Date | null) {
    this.items = this.items.map((i) => (i.id === id ? { ...i, doneAt } : i));
  }
  async updateItem(id: PlanItemId, patch: Partial<Pick<PlanItem, "title" | "minutes" | "day">>) {
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  }
}

const CID = "c1" as ContentId;
const content: Content = {
  id: CID,
  spaceId: null,
  kind: "text",
  title: "Biology",
  sourceUrl: null,
  filePath: null,
  status: "ready",
  error: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const seg = (idx: number, chars: number): Segment => ({
  id: `s${idx}` as SegmentId,
  contentId: CID,
  idx,
  text: "x".repeat(chars),
  locator: { type: "page", page: idx + 1 },
});
const chap = (idx: number, title: string, page: number): Chapter => ({
  id: `ch${idx}` as ChapterId,
  contentId: CID,
  idx,
  title,
  summary: "",
  locator: { type: "page", page },
});
const segments = [seg(0, 8000), seg(1, 8000), seg(2, 4000)];
const chapters = [chap(0, "Cells", 1), chap(1, "Energy", 3)];

function setup(dueDays: Date[] = []) {
  const plans = new MemPlans();
  const events: { kind: string; ref: string | null }[] = [];
  const deps = {
    plans,
    contents: {
      get: async (id: ContentId) => (id === CID ? content : null),
      listRecent: async () => [content],
    },
    chapters: { listByContent: async () => chapters },
    segments: { listByContent: async () => segments },
    flashcards: {
      listDue: async () => dueDays.map((due) => ({ fsrs: { ...newFsrsState(due), due } })),
    },
    spaces: { get: async () => null, list: async () => [] },
    studySets: { listByContent: async () => [], listBySpace: async () => [] },
    quizzes: { listQuestions: async () => [], listAttempts: async () => [] },
    activity: {
      record: async (kind: string, ref: string | null) => void events.push({ kind, ref }),
    },
  } as unknown as PlannerDeps;
  return { deps, plans, events };
}

const clock = { now: new Date("2026-11-18T10:00:00Z"), tzOffsetMin: 0 };
const input = {
  title: "Finals",
  goalDate: "2026-12-09",
  minutesPerDay: 60,
  studyDays: [0, 1, 2, 3, 4, 5, 6],
  spaceId: null,
  contentIds: [CID as string],
};

describe("chapterSizes", () => {
  it("splits the text at each chapter's start", () => {
    expect(chapterSizes(chapters, segments)).toEqual([16000, 4000]);
  });
  it("splits evenly when there are no matching locators", () => {
    expect(
      chapterSizes(
        [{ ...chap(0, "A", 1), locator: { type: "time", startSec: 0, endSec: 1 } }],
        segments,
      ),
    ).toEqual([20000]);
  });
});

describe("planner use cases", () => {
  it("creates a plan with items and saves it", async () => {
    const { deps, plans } = setup();
    const r = await createPlan(deps, input, clock);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.shortfall).toBeNull();
    expect(plans.items.length).toBe(r.value.items.length);
    expect(r.value.items.map((i) => i.title)).toContain("Learn: Cells");
  });

  it("rejects a goal in the past or a bad input", async () => {
    const { deps } = setup();
    expect((await createPlan(deps, { ...input, goalDate: "2026-11-18" }, clock)).ok).toBe(false);
    expect((await createPlan(deps, { ...input, minutesPerDay: 3 }, clock)).ok).toBe(false);
    expect((await createPlan(deps, { ...input, contentIds: ["nope"] }, clock)).ok).toBe(false);
  });

  it("uses the browser's day: 23:30 UTC is already tomorrow at UTC+2", async () => {
    const { deps } = setup();
    const r = await createPlan(deps, input, {
      now: new Date("2026-11-18T23:30:00Z"),
      tzOffsetMin: -120,
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.items[0]?.day).toBe("2026-11-19");
  });

  it("counts overdue cards on today", async () => {
    const { deps } = setup([new Date("2026-11-10T00:00:00Z"), new Date("2026-11-19T08:00:00Z")]);
    const r = await createPlan(deps, input, clock);
    if (!r.ok) throw new Error(r.error.message);
    const reviews = r.value.items.filter((i) => i.kind === "review");
    expect(reviews.map((i) => i.day)).toEqual(["2026-11-18", "2026-11-19"]);
  });

  it("ticking records activity once, unticking clears; Today lists it", async () => {
    const { deps, events } = setup();
    const r = await createPlan(deps, input, clock);
    if (!r.ok) throw new Error(r.error.message);
    const first = r.value.items[0] as PlanItem;
    const done = await setItemDone(
      deps,
      { planId: first.planId, itemId: first.id, done: true },
      clock.now,
    );
    expect(done.ok && done.value.doneAt).toEqual(clock.now);
    await setItemDone(deps, { planId: first.planId, itemId: first.id, done: true }, clock.now);
    expect(events).toEqual([{ kind: "plan_item_done", ref: first.id }]);
    const today = await getToday(deps, clock);
    expect(today.items.map((i) => i.id)).toContain(first.id);
    expect(today.items[0]?.planTitle).toBe("Finals");
    await setItemDone(deps, { planId: first.planId, itemId: first.id, done: false }, clock.now);
    expect((await deps.plans.listItems(first.planId))[0]?.doneAt).toBeNull();
  });

  it("re-plans from today, keeping finished items", async () => {
    const { deps, plans } = setup();
    const r = await createPlan(deps, input, clock);
    if (!r.ok) throw new Error(r.error.message);
    const first = r.value.items[0] as PlanItem;
    await setItemDone(deps, { planId: first.planId, itemId: first.id, done: true }, clock.now);
    // Two days skipped.
    const later = { now: new Date("2026-11-20T10:00:00Z"), tzOffsetMin: 0 };
    const again = await replan(deps, first.planId, later);
    if (!again.ok) throw new Error(again.error.message);
    const open = again.value.items.filter((i) => !i.doneAt);
    expect(open.every((i) => i.day >= "2026-11-20")).toBe(true);
    expect(again.value.items.find((i) => i.id === first.id)?.doneAt).not.toBeNull();
    expect(open.some((i) => i.title === first.title)).toBe(false);
    expect(plans.items.length).toBe(again.value.items.length);
  });

  it("re-plan can raise minutes per day, and the view reports a shortfall when late", async () => {
    const { deps } = setup();
    const r = await createPlan(
      deps,
      { ...input, minutesPerDay: 10 },
      { ...clock, now: new Date("2026-12-05T10:00:00Z") },
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.shortfall?.suggestedMinutesPerDay).toBeGreaterThan(10);
    const view = await getPlanView(deps, r.value.plan.id, {
      ...clock,
      now: new Date("2026-12-05T10:00:00Z"),
    });
    expect(view.ok && view.value.shortfall).not.toBeNull();
    const fixed = await replan(
      deps,
      r.value.plan.id,
      { ...clock, now: new Date("2026-12-05T10:00:00Z") },
      { minutesPerDay: r.value.shortfall?.suggestedMinutesPerDay as number },
    );
    expect(fixed.ok && fixed.value.shortfall).toBeNull();
  });

  it("edits an item and validates it", async () => {
    const { deps } = setup();
    const r = await createPlan(deps, input, clock);
    if (!r.ok) throw new Error(r.error.message);
    const item = r.value.items[0] as PlanItem;
    const ok = await editItem(deps, {
      planId: item.planId,
      itemId: item.id,
      patch: { title: " Skim ", minutes: 15, day: "2026-11-25" },
    });
    expect(ok.ok && ok.value).toMatchObject({ title: "Skim", minutes: 15, day: "2026-11-25" });
    expect(
      (await editItem(deps, { planId: item.planId, itemId: item.id, patch: { minutes: -1 } })).ok,
    ).toBe(false);
    expect(
      (await editItem(deps, { planId: item.planId, itemId: item.id, patch: { title: " " } })).ok,
    ).toBe(false);
    expect(
      (await editItem(deps, { planId: item.planId, itemId: item.id, patch: { day: "tomorrow" } }))
        .ok,
    ).toBe(false);
  });
});
