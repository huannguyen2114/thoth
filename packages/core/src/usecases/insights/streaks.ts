import type { ActivityDay } from "../../domain/activity";
import { addDays, weekStart } from "./days";

export interface HabitStats {
  /** Consecutive active days ending today, or yesterday when today has no activity yet. */
  currentStreak: number;
  longestStreak: number;
  /** Events since the Sunday of this week, and since 1 January. */
  thisWeek: number;
  thisYear: number;
  /** Today's events so far. */
  today: number;
}

/**
 * Streak rules (ADR-0023). A streak is a run of consecutive local days with at least one
 * event. Today with no events yet does not break it: the streak stays alive until the day ends.
 */
export function computeStats(days: ActivityDay[], today: string): HabitStats {
  const counts = new Map<string, number>();
  for (const d of days) if (d.count > 0) counts.set(d.day, (counts.get(d.day) ?? 0) + d.count);

  let cursor = counts.has(today) ? today : addDays(today, -1);
  let currentStreak = 0;
  while (counts.has(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  let longestStreak = 0;
  let run = 0;
  let last: string | null = null;
  for (const day of [...counts.keys()].sort()) {
    run = last !== null && addDays(last, 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    last = day;
  }

  const week = weekStart(today);
  const year = `${today.slice(0, 4)}-`;
  let thisWeek = 0;
  let thisYear = 0;
  for (const [day, n] of counts) {
    if (day > today) continue;
    if (day >= week) thisWeek += n;
    if (day.startsWith(year)) thisYear += n;
  }
  return { currentStreak, longestStreak, thisWeek, thisYear, today: counts.get(today) ?? 0 };
}
