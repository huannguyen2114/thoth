import type { ActivityDay } from "../../domain/activity";
import { addDays, weekStart } from "./days";

export const HEATMAP_WEEKS = 53;

export interface HeatmapCell {
  day: string;
  count: number;
  /** 0 = no activity, 1..4 = Hearth colour steps. */
  level: 0 | 1 | 2 | 3 | 4;
  /** After today: drawn empty and not hoverable. */
  future: boolean;
}

export interface Heatmap {
  /** Columns of 7 cells, Sunday first; the last column holds today. */
  weeks: HeatmapCell[][];
  /** Column index and short month name where a new month starts. */
  months: { col: number; label: string }[];
  /** First and last day shown. */
  from: string;
  to: string;
}

/** Colour step for a count, relative to the busiest day: 1 for light use up to 4 for the max. */
export function levelFor(count: number, max: number): HeatmapCell["level"] {
  if (count <= 0 || max <= 0) return 0;
  return (1 + Math.min(3, Math.floor(((count - 1) * 4) / max))) as HeatmapCell["level"];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Buckets per-day counts into the last `weekCount` weeks ending at `today`. */
export function buildHeatmap(
  days: ActivityDay[],
  today: string,
  weekCount = HEATMAP_WEEKS,
): Heatmap {
  const counts = new Map(days.map((d) => [d.day, d.count]));
  const first = addDays(weekStart(today), -7 * (weekCount - 1));

  let max = 0;
  for (let i = 0; i < weekCount * 7; i++) {
    const day = addDays(first, i);
    if (day <= today) max = Math.max(max, counts.get(day) ?? 0);
  }

  const weeks: HeatmapCell[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const col: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(first, w * 7 + d);
      const future = day > today;
      const count = future ? 0 : (counts.get(day) ?? 0);
      col.push({ day, count, level: levelFor(count, max), future });
    }
    weeks.push(col);
  }

  // A month label sits above the first column that starts in that month; the first column
  // gives way to the second when both would be labelled (they would overlap).
  const months: Heatmap["months"] = [];
  let prev = -1;
  weeks.forEach((col, i) => {
    const m = Number((col[0]?.day ?? "").slice(5, 7)) - 1;
    if (m !== prev) months.push({ col: i, label: MONTHS[m] ?? "" });
    prev = m;
  });
  if (months.length > 1 && (months[1]?.col ?? 99) < 3) months.shift();

  return { weeks, months, from: first, to: addDays(first, weekCount * 7 - 1) };
}
