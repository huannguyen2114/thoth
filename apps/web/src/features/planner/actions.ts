"use server";

import {
  createPlan,
  deletePlan,
  editItem,
  getPlanView,
  getToday,
  type ItemPatch,
  listPlans,
  type PlanId,
  type PlanInput,
  type PlanItemId,
  type PlanOverview,
  type PlanView,
  replan,
  type Shortfall,
  setItemDone,
  type TodayItem,
} from "@thoth/core";
import { type ActionResult, toActionResult } from "@/lib/action-result";
import { getContainer } from "@/server/container";

/**
 * Thin adapters for the study planner (ADR-0030). Day edges depend on the browser's timezone,
 * so every action takes `tzOffsetMin` (the browser's `Date#getTimezoneOffset()`), like habits.
 */
const clock = (tzOffsetMin: number) => ({
  now: new Date(),
  tzOffsetMin: Number.isFinite(tzOffsetMin) ? Math.trunc(tzOffsetMin) : 0,
});

export async function loadPlansAction(tzOffsetMin: number): Promise<PlanOverview[]> {
  return listPlans(await getContainer(), clock(tzOffsetMin));
}

export async function loadPlanAction(
  planId: PlanId,
  tzOffsetMin: number,
): Promise<ActionResult<PlanView>> {
  return toActionResult(await getPlanView(await getContainer(), planId, clock(tzOffsetMin)));
}

export async function createPlanAction(
  input: PlanInput,
  tzOffsetMin: number,
): Promise<ActionResult<{ planId: PlanId; shortfall: Shortfall | null }>> {
  const r = await createPlan(await getContainer(), input, clock(tzOffsetMin));
  return r.ok
    ? { ok: true, value: { planId: r.value.plan.id, shortfall: r.value.shortfall } }
    : toActionResult(r);
}

export async function replanAction(
  planId: PlanId,
  tzOffsetMin: number,
  minutesPerDay?: number,
): Promise<ActionResult<{ shortfall: Shortfall | null }>> {
  const r = await replan(
    await getContainer(),
    planId,
    clock(tzOffsetMin),
    minutesPerDay === undefined ? undefined : { minutesPerDay },
  );
  return r.ok ? { ok: true, value: { shortfall: r.value.shortfall } } : toActionResult(r);
}

/** Re-plans every plan whose goal is still ahead (the "Re-plan" palette command). */
export async function replanAllAction(
  tzOffsetMin: number,
): Promise<ActionResult<{ replanned: number }>> {
  const c = await getContainer();
  const now = clock(tzOffsetMin);
  let replanned = 0;
  for (const o of await listPlans(c, now)) {
    if (o.daysLeft <= 0) continue;
    const r = await replan(c, o.plan.id, now);
    if (!r.ok) return toActionResult(r);
    replanned += 1;
  }
  return { ok: true, value: { replanned } };
}

export async function setItemDoneAction(
  planId: PlanId,
  itemId: PlanItemId,
  done: boolean,
): Promise<ActionResult<null>> {
  const r = await setItemDone(await getContainer(), { planId, itemId, done }, new Date());
  return r.ok ? { ok: true, value: null } : toActionResult(r);
}

export async function editItemAction(
  planId: PlanId,
  itemId: PlanItemId,
  patch: ItemPatch,
): Promise<ActionResult<null>> {
  const r = await editItem(await getContainer(), { planId, itemId, patch });
  return r.ok ? { ok: true, value: null } : toActionResult(r);
}

export async function deletePlanAction(planId: PlanId): Promise<void> {
  await deletePlan(await getContainer(), planId);
}

export async function loadTodayAction(
  tzOffsetMin: number,
): Promise<{ day: string; items: TodayItem[]; missed: number }> {
  return getToday(await getContainer(), clock(tzOffsetMin));
}
