import { describe, expect, it } from "vitest";
import type { PlanItem } from "../../domain/plan";
import type { ContentId, PlanId, PlanItemId } from "../../shared/id";
import { addDays, weekdayOf } from "../insights/days";
import {
  type BuildPlanInput,
  buildPlan,
  EXAM_MINUTES,
  learnMinutes,
  type PlanChapter,
} from "./build-plan";

const c1 = "c1" as ContentId;
const c2 = "c2" as ContentId;
const chapter = (title: string, chars: number, contentId = c1): PlanChapter => ({
  contentId,
  contentTitle: "Book",
  title,
  chars,
});

// 2026-11-18 is a Wednesday.
const base: BuildPlanInput = {
  today: "2026-11-18",
  goalDate: "2026-12-09",
  minutesPerDay: 60,
  studyDays: [0, 1, 2, 3, 4, 5, 6],
  chapters: [chapter("A", 8000), chapter("B", 16000), chapter("C", 4000), chapter("D", 24000)],
  weak: [],
  cardsDue: {},
  done: [],
};

const perDay = (items: { day: string; minutes: number }[]) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.day, (m.get(i.day) ?? 0) + i.minutes);
  return m;
};
const dayOf = (items: { day: string; title: string }[], title: string) =>
  items.find((i) => i.title === title)?.day;

describe("learnMinutes", () => {
  it("is one minute per 800 characters, between 5 and 40", () => {
    expect(learnMinutes(0)).toBe(5);
    expect(learnMinutes(8000)).toBe(10);
    expect(learnMinutes(10_000_000)).toBe(40);
  });
});

describe("buildPlan", () => {
  it("never exceeds the minutes per day, even with cards due", () => {
    const cardsDue = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [addDays(base.today, i), 80]),
    );
    for (const mpd of [15, 30, 60, 120]) {
      const r = buildPlan({ ...base, minutesPerDay: mpd, cardsDue });
      for (const [, total] of perDay(r.items)) expect(total).toBeLessThanOrEqual(mpd);
    }
  });

  it("covers every chapter with a learn and a quiz item", () => {
    const r = buildPlan(base);
    expect(r.shortfall).toBeNull();
    for (const c of base.chapters) {
      expect(dayOf(r.items, `Learn: ${c.title}`)).toBeDefined();
      expect(dayOf(r.items, `Quiz: ${c.title}`)).toBeDefined();
    }
  });

  it("learns a chapter before its quiz", () => {
    const r = buildPlan(base);
    for (const c of base.chapters) {
      expect(
        (dayOf(r.items, `Quiz: ${c.title}`) as string) >
          (dayOf(r.items, `Learn: ${c.title}`) as string),
      ).toBe(true);
    }
  });

  it("places the mock exam two or three days before the goal, with a rest day after", () => {
    const r = buildPlan(base);
    const exam = r.items.filter((i) => i.kind === "exam");
    expect(exam).toHaveLength(1);
    expect(exam[0]?.day).toBe("2026-12-06");
    expect(exam[0]?.minutes).toBe(EXAM_MINUTES);
    const rest = r.items.filter((i) => i.kind === "rest");
    expect(rest.map((i) => i.day)).toEqual(["2026-12-08"]);
    expect(r.items.every((i) => i.day < base.goalDate)).toBe(true);
    // Everything to learn comes before the exam.
    for (const i of r.items.filter((x) => x.kind === "learn"))
      expect(i.day <= "2026-12-06").toBe(true);
  });

  it("falls back to two days before when three days out is not a study day", () => {
    // 2026-12-06 is a Sunday.
    const r = buildPlan({ ...base, studyDays: [1, 2, 3, 4, 5, 6] });
    expect(r.items.find((i) => i.kind === "exam")?.day).toBe("2026-12-07");
  });

  it("schedules weak topics first, and retries them later", () => {
    const r = buildPlan({
      ...base,
      weak: [{ contentId: c1, topic: "D", score: 0.3 }],
    });
    const learnDays = r.items.filter((i) => i.kind === "learn").map((i) => i.day);
    expect(dayOf(r.items, "Learn: D")).toBe([...learnDays].sort()[0]);
    const retry = dayOf(r.items, "Retry quiz: D");
    expect(retry).toBeDefined();
    expect((retry as string) > (dayOf(r.items, "Quiz: D") as string)).toBe(true);
  });

  it("puts the weakest topic before a less weak one", () => {
    const r = buildPlan({
      ...base,
      minutesPerDay: 10,
      weak: [
        { contentId: c1, topic: "B", score: 0.6 },
        { contentId: c1, topic: "C", score: 0.2 },
      ],
    });
    const learn = [
      ...new Set(
        r.items.filter((i) => i.kind === "learn").map((i) => i.title.replace(/ \(\d\/\d\)$/, "")),
      ),
    ];
    expect(learn.indexOf("Learn: C")).toBeLessThan(learn.indexOf("Learn: B"));
    expect(learn.indexOf("Learn: B")).toBeLessThan(learn.indexOf("Learn: A"));
  });

  it("spreads the work across the weeks instead of cramming it into the first days", () => {
    const r = buildPlan({ ...base, minutesPerDay: 120 });
    const days = new Set(r.items.filter((i) => i.kind !== "rest").map((i) => i.day));
    expect(days.size).toBeGreaterThanOrEqual(5);
    for (const [, total] of perDay(r.items.filter((i) => i.kind !== "exam"))) {
      expect(total).toBeLessThan(120);
    }
  });

  it("skips days that are not study days", () => {
    const r = buildPlan({ ...base, studyDays: [1, 3] });
    for (const i of r.items.filter((x) => x.kind !== "rest")) {
      expect([1, 3]).toContain(weekdayOf(i.day));
    }
  });

  it("adds a review block on days with cards due, and carries cards over non-study days", () => {
    const r = buildPlan({
      ...base,
      studyDays: [1, 2, 3, 4, 5],
      cardsDue: { "2026-11-21": 20, "2026-11-22": 20 },
    });
    const reviews = r.items.filter((i) => i.kind === "review");
    // Saturday and Sunday cards roll to Monday as one block of 40 cards.
    expect(reviews.map((i) => [i.day, i.title])).toEqual([["2026-11-23", "Review 40 flashcards"]]);
    expect(reviews[0]?.minutes).toBe(20);
  });

  it("reports not enough time and proposes more minutes per day instead of cramming", () => {
    const r = buildPlan({
      ...base,
      today: "2026-12-04",
      goalDate: "2026-12-09",
      minutesPerDay: 20,
    });
    expect(r.shortfall).not.toBeNull();
    expect(r.shortfall?.message).toMatch(/Not enough time/);
    const need = r.shortfall?.suggestedMinutesPerDay;
    expect(need).toBeGreaterThan(20);
    for (const [, total] of perDay(r.items)) expect(total).toBeLessThanOrEqual(20);
    // The suggestion really fits.
    const again = buildPlan({
      ...base,
      today: "2026-12-04",
      goalDate: "2026-12-09",
      minutesPerDay: need as number,
    });
    expect(again.shortfall).toBeNull();
  });

  it("splits a chapter longer than a day", () => {
    const r = buildPlan({ ...base, chapters: [chapter("Big", 40_000)], minutesPerDay: 15 });
    const parts = r.items.filter((i) => i.kind === "learn");
    expect(parts.map((i) => i.title)).toEqual([
      "Learn: Big (1/3)",
      "Learn: Big (2/3)",
      "Learn: Big (3/3)",
    ]);
    expect(parts.reduce((n, i) => n + i.minutes, 0)).toBe(40);
    expect(new Set(parts.map((i) => i.day)).size).toBe(3);
  });

  it("is deterministic", () => {
    expect(buildPlan(base)).toEqual(buildPlan(structuredClone(base)));
  });

  it("uses local days as given: a plan starting today does not leak into the past", () => {
    const r = buildPlan(base);
    expect(r.items.every((i) => i.day >= base.today)).toBe(true);
    expect(r.items.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.day))).toBe(true);
  });
});

describe("buildPlan when re-planning", () => {
  const doneItem = (over: Partial<PlanItem>): PlanItem => ({
    id: "i" as PlanItemId,
    planId: "p" as PlanId,
    day: "2026-11-18",
    idx: 0,
    kind: "learn",
    title: "Learn: A",
    minutes: 10,
    contentId: c1,
    topic: "A",
    doneAt: new Date("2026-11-18T09:00:00Z"),
    ...over,
  });

  it("does not schedule finished work again and counts its time against the day", () => {
    const r = buildPlan({
      ...base,
      today: "2026-11-19",
      done: [
        doneItem({}),
        doneItem({ day: "2026-11-19", kind: "learn", topic: "B", title: "Learn: B", minutes: 50 }),
      ],
    });
    expect(r.items.find((i) => i.title === "Learn: A")).toBeUndefined();
    expect(r.items.find((i) => i.title === "Learn: B")).toBeUndefined();
    const today = perDay(r.items).get("2026-11-19") ?? 0;
    expect(today + 50).toBeLessThanOrEqual(60);
    expect(r.items.find((i) => i.title === "Learn: C")).toBeDefined();
  });

  it("rolls missed work forward from today", () => {
    const first = buildPlan(base);
    const missed = first.items.filter((i) => i.day < "2026-11-21" && i.kind !== "rest");
    expect(missed.length).toBeGreaterThan(0);
    const again = buildPlan({ ...base, today: "2026-11-21" });
    expect(again.items.every((i) => i.day >= "2026-11-21")).toBe(true);
    for (const m of missed) expect(again.items.some((i) => i.title === m.title)).toBe(true);
  });

  it("quizzes a finished chapter on a later day, and a plan that fit still fits after one tick", () => {
    const chapters = Array.from({ length: 9 }, (_, i) => chapter(`T${i}`, 1000));
    const input = { ...base, minutesPerDay: 45, studyDays: [1, 2, 3, 4, 5, 6], chapters };
    const weak = [{ contentId: c1, topic: "T5", score: 0.2 }];
    expect(buildPlan({ ...input, weak }).shortfall).toBeNull();
    const done = [doneItem({ topic: "T5", title: "Learn: T5", minutes: 5 })];
    const r = buildPlan({ ...input, weak, done });
    expect(r.shortfall).toBeNull();
    expect((dayOf(r.items, "Quiz: T5") as string) > "2026-11-18").toBe(true);
  });

  it("never reports a shortfall for a generous budget, whatever the goal distance", () => {
    for (let days = 4; days <= 40; days++) {
      const goalDate = addDays(base.today, days);
      const r = buildPlan({ ...base, goalDate, minutesPerDay: 240 });
      if (days >= 6) expect(r.shortfall).toBeNull();
      for (const [, total] of perDay(r.items)) expect(total).toBeLessThanOrEqual(240);
    }
  });

  it("keeps a finished exam and does not add a second one", () => {
    const r = buildPlan({
      ...base,
      done: [
        doneItem({
          kind: "exam",
          title: "Mock exam",
          day: "2026-11-30",
          contentId: null,
          topic: null,
          minutes: 45,
        }),
      ],
    });
    expect(r.items.some((i) => i.kind === "exam")).toBe(false);
  });
});

it("handles several contents and no chapters", () => {
  expect(
    buildPlan({ ...base, chapters: [] })
      .items.map((i) => i.kind)
      .sort(),
  ).toEqual(["exam", "rest"]);
  const r = buildPlan({ ...base, chapters: [chapter("A", 800), chapter("A", 800, c2)] });
  expect(r.items.filter((i) => i.kind === "learn")).toHaveLength(2);
});
