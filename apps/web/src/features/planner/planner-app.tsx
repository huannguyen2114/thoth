"use client";

import type { PlanId, PlanOverview } from "@thoth/core";
import { Button, cx } from "@thoth/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { loadPlansAction } from "./actions";
import { formatDay, tzOffset } from "./format";
import { NewPlanDialog, type PlannerContent, type PlannerSpace } from "./new-plan-dialog";
import { PlanDetail } from "./plan-detail";

/**
 * The planner page: plans on the left, the chosen plan on the right (one at a time on a
 * phone). The URL holds the state (`?plan=ID`, `?new=1`), so the palette commands and the
 * Today card can link straight to it.
 */
export function PlannerApp({
  spaces,
  contents,
}: {
  spaces: PlannerSpace[];
  contents: PlannerContent[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const planParam = params.get("plan");
  const newOpen = params.get("new") === "1";
  const [plans, setPlans] = useState<PlanOverview[] | null>(null);

  const reload = useCallback(async () => setPlans(await loadPlansAction(tzOffset())), []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const open = (id: PlanId | null) => router.replace(id ? `/planner?plan=${id}` : "/planner");
  const activeId = planParam ?? plans?.[0]?.plan.id ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="type-display-lg text-ink">Planner</h1>
          <p className="text-ink-muted">A study schedule that adapts to your progress.</p>
        </div>
        <Button variant="primary" onClick={() => router.replace("/planner?new=1")}>
          New plan
        </Button>
      </header>

      {plans === null ? (
        <div className="h-64 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-surface-200 p-6">
          <h2 className="type-heading-3 text-ink">No study plans yet</h2>
          <p className="text-ink-muted">
            Pick a goal date and Thoth schedules chapters, quizzes, reviews and a mock exam around
            it.
          </p>
          <Button variant="primary" onClick={() => router.replace("/planner?new=1")}>
            Make a plan
          </Button>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Plans" className={cx(planParam ? "hidden md:block" : "block")}>
            <ul className="flex flex-col gap-2">
              {plans.map((o) => {
                const pct = o.totalMinutes ? Math.round((o.doneMinutes / o.totalMinutes) * 100) : 0;
                return (
                  <li key={o.plan.id}>
                    <Link
                      href={`/planner?plan=${o.plan.id}`}
                      replace
                      aria-current={o.plan.id === activeId ? "page" : undefined}
                      className={cx(
                        "flex min-h-11 flex-col gap-2 rounded-lg border p-3 transition-colors duration-150",
                        o.plan.id === activeId
                          ? "border-accent bg-accent-tint"
                          : "border-border-subtle bg-surface-200",
                      )}
                    >
                      <span className="type-body-strong truncate text-ink">{o.plan.title}</span>
                      <span className="type-caption text-ink-muted">
                        {o.daysLeft > 0
                          ? `${o.daysLeft} ${o.daysLeft === 1 ? "day" : "days"} left`
                          : o.daysLeft === 0
                            ? "Goal day is today"
                            : `Ended ${formatDay(o.plan.goalDate)}`}{" "}
                        · {pct}% done
                      </span>
                      <span className="h-1 rounded-pill bg-neutral-tint" aria-hidden="true">
                        <span
                          className="block h-1 rounded-pill bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className={cx("min-w-0", planParam ? "block" : "hidden md:block")}>
            {activeId && (
              <PlanDetail
                key={activeId}
                planId={activeId as PlanId}
                onChanged={() => void reload()}
                onBack={() => open(null)}
              />
            )}
          </div>
        </div>
      )}

      {newOpen && (
        <NewPlanDialog
          spaces={spaces}
          contents={contents}
          onClose={() => router.replace(planParam ? `/planner?plan=${planParam}` : "/planner")}
          onCreated={(id) => {
            void reload();
            open(id);
          }}
        />
      )}
    </div>
  );
}
