"use server";

import { getHabits, getToday, listDueCards } from "@thoth/core";
import { getContainer } from "@/server/container";

export interface HomeNumbers {
  due: number;
  streak: number;
  today: { done: number; total: number };
}

/** The numbers on Home's today strip. Needs the browser's time zone for streaks and today. */
export async function loadHomeNumbersAction(tzOffsetMin: number): Promise<HomeNumbers> {
  const c = await getContainer();
  const now = new Date();
  const [due, habits, today] = await Promise.all([
    listDueCards({ flashcards: c.flashcards, studySets: c.studySets }),
    getHabits({ activity: c.activity }, { now, tzOffsetMin }),
    getToday({ plans: c.plans }, { now, tzOffsetMin }),
  ]);
  return {
    due: due.length,
    streak: habits.stats.currentStreak,
    today: { done: today.items.filter((i) => i.doneAt).length, total: today.items.length },
  };
}
