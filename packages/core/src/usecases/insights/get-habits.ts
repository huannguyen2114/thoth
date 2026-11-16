import type { ActivityRepository } from "../../ports/repositories";
import { localDay } from "./days";
import { buildHeatmap, type Heatmap } from "./heatmap";
import { computeStats, type HabitStats } from "./streaks";

export interface Habits {
  today: string;
  heatmap: Heatmap;
  stats: HabitStats;
}

/**
 * Heatmap and streaks for the owner's local days. The whole history is read (one grouped
 * query, ADR-0023) so the longest streak is all-time, not just the last year.
 */
export async function getHabits(
  deps: { activity: ActivityRepository },
  input: { now: Date; tzOffsetMin: number },
): Promise<Habits> {
  const today = localDay(input.now, input.tzOffsetMin);
  const days = await deps.activity.countByDay(new Date(0), input.now, input.tzOffsetMin);
  return { today, heatmap: buildHeatmap(days, today), stats: computeStats(days, today) };
}
