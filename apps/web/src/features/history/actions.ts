"use server";

import { getHistory, type HistoryDay } from "@thoth/core";
import { getContainer } from "@/server/container";

const LIMIT = 300;

export async function loadHistoryAction(tzOffsetMin: number): Promise<HistoryDay[]> {
  const tz = Number.isFinite(tzOffsetMin) ? Math.trunc(tzOffsetMin) : 0;
  return getHistory(await getContainer(), { limit: LIMIT, tzOffsetMin: tz });
}
