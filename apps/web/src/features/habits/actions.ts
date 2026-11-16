"use server";

import { getHabits, type Habits } from "@thoth/core";
import { getContainer } from "@/server/container";

/** Heatmap and streaks for the browser's own days (its timezone offset decides day edges). */
export async function loadHabitsAction(tzOffsetMin: number): Promise<Habits> {
  const tz = Number.isFinite(tzOffsetMin) ? Math.trunc(tzOffsetMin) : 0;
  return getHabits(await getContainer(), { now: new Date(), tzOffsetMin: tz });
}
