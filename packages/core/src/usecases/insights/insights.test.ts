import { describe, expect, it } from "vitest";
import type { ActivityDay, ActivityEvent } from "../../domain/activity";
import type { ActivityRepository } from "../../ports/repositories";
import { addDays, localDay, weekStart } from "./days";
import { getHabits } from "./get-habits";
import { buildHeatmap, levelFor } from "./heatmap";
import { groupByDay, type HistoryItem } from "./history";
import { computeStats } from "./streaks";

const d = (day: string, count = 1): ActivityDay => ({ day, count });

describe("localDay (day boundaries)", () => {
  // getTimezoneOffset() is minutes BEHIND UTC: UTC+7 gives -420, UTC-5 gives 300.
  it("UTC+7: 20:00Z is already the next local day", () => {
    expect(localDay(new Date("2026-11-15T20:00:00Z"), -420)).toBe("2026-11-16");
    expect(localDay(new Date("2026-11-15T16:59:59Z"), -420)).toBe("2026-11-15");
  });
  it("UTC-5: 02:00Z still belongs to the previous local day", () => {
    expect(localDay(new Date("2026-11-16T02:00:00Z"), 300)).toBe("2026-11-15");
    expect(localDay(new Date("2026-11-16T05:00:00Z"), 300)).toBe("2026-11-16");
  });
  it("crosses month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("starts weeks on Sunday", () => {
    expect(weekStart("2026-11-16")).toBe("2026-11-15"); // Monday -> Sunday
    expect(weekStart("2026-11-15")).toBe("2026-11-15");
  });
});

describe("computeStats", () => {
  const today = "2026-11-16";
  it("counts consecutive days ending today", () => {
    const s = computeStats([d("2026-11-14"), d("2026-11-15"), d("2026-11-16")], today);
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
  });
  it("keeps the streak alive when today has no activity yet", () => {
    const s = computeStats([d("2026-11-14"), d("2026-11-15")], today);
    expect(s.currentStreak).toBe(2);
    expect(s.today).toBe(0);
  });
  it("breaks the streak after a missed day", () => {
    const s = computeStats([d("2026-11-13"), d("2026-11-14"), d("2026-11-16")], today);
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(2);
  });
  it("is zero when yesterday and today are both empty", () => {
    const s = computeStats([d("2026-11-10"), d("2026-11-11"), d("2026-11-12")], today);
    expect(s.currentStreak).toBe(0);
    expect(s.longestStreak).toBe(3);
  });
  it("ignores zero counts and unsorted input", () => {
    const s = computeStats([d("2026-11-16"), d("2026-11-15", 0), d("2026-11-14")], today);
    expect(s.currentStreak).toBe(1);
  });
  it("totals this week (from Sunday) and this year", () => {
    const s = computeStats(
      [d("2026-11-14", 5), d("2026-11-15", 2), d("2026-11-16", 3), d("2025-12-31", 9)],
      today,
    );
    expect(s.thisWeek).toBe(5);
    expect(s.thisYear).toBe(10);
    expect(s.today).toBe(3);
  });
  it("handles a streak across a year boundary", () => {
    const s = computeStats([d("2025-12-31"), d("2026-01-01")], "2026-01-01");
    expect(s.currentStreak).toBe(2);
    expect(s.thisYear).toBe(1);
  });
});

describe("buildHeatmap", () => {
  const today = "2026-11-16"; // a Monday
  const map = buildHeatmap([d("2026-11-16", 4), d("2026-11-15", 1)], today);

  it("has 53 columns of 7 days, ending in the week of today", () => {
    expect(map.weeks).toHaveLength(53);
    expect(map.weeks.every((w) => w.length === 7)).toBe(true);
    expect(map.weeks[52]?.[0]?.day).toBe("2026-11-15");
    expect(map.weeks[0]?.[0]?.day).toBe("2025-11-16");
  });
  it("marks days after today as future and empty", () => {
    const last = map.weeks[52] ?? [];
    expect(last[1]?.day).toBe(today);
    expect(last[2]?.future).toBe(true);
    expect(last[1]?.future).toBe(false);
  });
  it("buckets counts into levels relative to the busiest day", () => {
    const last = map.weeks[52] ?? [];
    expect(last[1]?.level).toBe(4);
    expect(last[0]?.level).toBe(1);
    expect(last[6]?.level).toBe(0);
  });
  it("levelFor spreads 1..max over steps 1..4", () => {
    expect(levelFor(0, 10)).toBe(0);
    expect(levelFor(1, 10)).toBe(1);
    expect(levelFor(10, 10)).toBe(4);
    expect(levelFor(1, 1)).toBe(1);
    expect(levelFor(5, 0)).toBe(0);
  });
  it("labels months once, in order, without crowding the first column", () => {
    const labels = map.months.map((m) => m.label);
    expect(labels.at(-1)).toBe("Nov");
    expect(new Set(labels.slice(0, 12)).size).toBe(labels.slice(0, 12).length);
    const cols = map.months.map((m) => m.col);
    expect(cols.every((c, i) => i === 0 || c - (cols[i - 1] ?? 0) >= 3)).toBe(true);
  });
  it("is all level 0 with no activity", () => {
    expect(
      buildHeatmap([], today)
        .weeks.flat()
        .every((c) => c.level === 0),
    ).toBe(true);
  });
});

describe("getHabits", () => {
  it("asks for the client's days and derives today from its offset", async () => {
    let seenTz: number | undefined;
    const activity = {
      async countByDay(_f: Date, _t: Date, tz: number) {
        seenTz = tz;
        return [d("2026-11-16", 2)];
      },
    } as unknown as ActivityRepository;
    // 20:00Z on the 15th is the 16th in UTC+7.
    const h = await getHabits(
      { activity },
      { now: new Date("2026-11-15T20:00:00Z"), tzOffsetMin: -420 },
    );
    expect(seenTz).toBe(-420);
    expect(h.today).toBe("2026-11-16");
    expect(h.stats.currentStreak).toBe(1);
  });
});

describe("groupByDay", () => {
  const item = (id: string, iso: string): HistoryItem => ({
    id,
    kind: "quiz_answer",
    at: new Date(iso),
    label: "x",
    subject: null,
    href: null,
  });
  it("groups newest-first items by local day", () => {
    const events: ActivityEvent[] = [];
    expect(events).toHaveLength(0);
    const out = groupByDay(
      [
        item("a", "2026-11-15T20:30:00Z"),
        item("b", "2026-11-15T18:00:00Z"),
        item("c", "2026-11-15T10:00:00Z"),
      ],
      -420,
    );
    // UTC+7: a and b are 16 Nov (03:30, 01:00), c is 15 Nov (17:00).
    expect(out.map((g) => [g.day, g.items.length])).toEqual([
      ["2026-11-16", 2],
      ["2026-11-15", 1],
    ]);
  });
});
