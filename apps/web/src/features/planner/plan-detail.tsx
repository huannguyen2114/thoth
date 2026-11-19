"use client";

import type { PlanId, PlanItem, PlanItemId, PlanView } from "@thoth/core";
import { Button, CancelButton, cx, Dialog } from "@thoth/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deletePlanAction,
  editItemAction,
  loadPlanAction,
  replanAction,
  setItemDoneAction,
} from "./actions";
import {
  addDaysTo,
  formatDay,
  itemHref,
  minutesLabel,
  todayLocal,
  tzOffset,
  weekdayOf,
  weekStartOf,
} from "./format";
import { ItemRow } from "./item-row";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PlanDetailSkeleton() {
  return <div className="h-96 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />;
}

/** One plan: progress, a week-by-week calendar, and the selected day's tasks. */
export function PlanDetail({
  planId,
  onChanged,
  onBack,
}: {
  planId: PlanId;
  /** Called after a change that affects the plan list (progress, deletion). */
  onChanged: () => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [day, setDay] = useState(todayLocal);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const r = await loadPlanAction(planId, tzOffset());
    if (r.ok) setView(r.value);
    else setError(r.error);
  }, [planId]);

  useEffect(() => {
    setView(null);
    setError(null);
    void load();
  }, [load]);

  const today = todayLocal();
  const items = view?.items ?? [];
  const byDay = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    for (const i of items) m.set(i.day, [...(m.get(i.day) ?? []), i]);
    return m;
  }, [items]);

  // Start on today when it is inside the plan, else on the first planned day.
  const firstDay = items[0]?.day;
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!view || started) return;
    setStarted(true);
    if (view.plan.goalDate < today && firstDay) setDay(firstDay);
  }, [view, started, today, firstDay]);

  if (!view) {
    return error ? (
      <p role="alert" className="callout callout--danger">
        {error}
      </p>
    ) : (
      <PlanDetailSkeleton />
    );
  }

  const { plan } = view;
  const doneItems = items.filter((i) => i.doneAt);
  const doneMin = doneItems.reduce((n, i) => n + i.minutes, 0);
  const totalMin = items.reduce((n, i) => n + i.minutes, 0);
  const pct = totalMin > 0 ? Math.round((doneMin / totalMin) * 100) : 0;
  const missed = items.filter((i) => i.day < today && !i.doneAt && i.kind !== "rest").length;

  const toggle = async (item: PlanItem, done: boolean) => {
    setError(null);
    const stamp = done ? new Date() : null;
    const set = (v: Date | null) =>
      setView(
        (p) =>
          p && { ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, doneAt: v } : i)) },
      );
    set(stamp);
    const r = await setItemDoneAction(planId, item.id as PlanItemId, done);
    if (!r.ok) {
      set(item.doneAt);
      setError(r.error);
    } else onChanged();
  };

  const replan = async (minutesPerDay?: number) => {
    setPending(true);
    setError(null);
    const r = await replanAction(planId, tzOffset(), minutesPerDay);
    if (!r.ok) setError(r.error);
    await load();
    setPending(false);
    onChanged();
  };

  // The calendar shows one week at a time, Monday to Sunday.
  const weekStart = weekStartOf(day);
  const firstWeek = weekStartOf(items[0]?.day ?? today);
  const lastWeek = weekStartOf(plan.goalDate);
  const week = Array.from({ length: 7 }, (_, i) => addDaysTo(weekStart, i));
  const dayItems = byDay.get(day) ?? [];
  const dayMin = dayItems.reduce((n, i) => n + i.minutes, 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onBack}
          className="type-label self-start text-accent-text md:hidden"
        >
          All plans
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="type-heading-1 truncate text-ink">{plan.title}</h2>
            <p className="text-ink-muted">
              Goal {formatDay(plan.goalDate, { weekday: "short", day: "numeric", month: "long" })} ·{" "}
              {view.daysLeft > 0
                ? `${view.daysLeft} ${view.daysLeft === 1 ? "day" : "days"} left`
                : view.daysLeft === 0
                  ? "goal day is today"
                  : "goal date has passed"}
              {" · "}
              {minutesLabel(plan.minutesPerDay)} a day
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void replan()} disabled={pending || view.daysLeft <= 0}>
              {pending ? "Re-planning" : "Re-plan"}
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="h-2 flex-1 rounded-pill bg-neutral-tint"
            role="progressbar"
            aria-label="Plan progress"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-2 rounded-pill bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <span className="type-label text-ink tabular-nums">
            {pct}%
            <span className="type-caption text-ink-muted">
              {" "}
              · {doneItems.length} of {items.length} tasks
            </span>
          </span>
        </div>
      </header>

      {error && (
        <p role="alert" className="callout callout--danger">
          {error}
        </p>
      )}
      {view.shortfall && (
        <div role="alert" className="callout callout--warning flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1">{view.shortfall.message}</p>
          {view.shortfall.suggestedMinutesPerDay !== null && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => void replan(view.shortfall?.suggestedMinutesPerDay ?? undefined)}
            >
              Re-plan at {view.shortfall.suggestedMinutesPerDay} min a day
            </Button>
          )}
        </div>
      )}
      {missed > 0 && view.daysLeft > 0 && (
        <p role="note" className="callout callout--info">
          {missed} task{missed === 1 ? "" : "s"} from earlier days {missed === 1 ? "is" : "are"}{" "}
          still open. Re-plan moves {missed === 1 ? "it" : "them"} forward from today.
        </p>
      )}

      <section className="flex flex-col gap-3" aria-label="Calendar">
        <div className="flex items-center justify-between gap-2">
          <h3 className="type-heading-3 text-ink">
            Week of {formatDay(weekStart, { day: "numeric", month: "short" })}
          </h3>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Previous week"
              disabled={weekStart <= firstWeek}
              onClick={() => setDay(addDaysTo(weekStart, -7))}
            >
              ‹
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDay(today)}>
              Today
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Next week"
              disabled={weekStart >= lastWeek}
              onClick={() => setDay(addDaysTo(weekStart, 7))}
            >
              ›
            </Button>
          </div>
        </div>
        <fieldset className="m-0 grid min-w-0 grid-cols-7 gap-1 border-0 p-0 sm:gap-2">
          <legend className="sr-only">Days of the week</legend>
          {week.map((d) => {
            const list = byDay.get(d) ?? [];
            const planned = list.reduce((n, i) => n + i.minutes, 0);
            const finished = list.filter((i) => i.doneAt).length;
            const all = list.length > 0 && finished === list.length;
            const isGoal = d === plan.goalDate;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                aria-pressed={d === day}
                aria-label={`${formatDay(d, { weekday: "long", day: "numeric", month: "long" })}: ${
                  isGoal
                    ? "goal day"
                    : list.length === 0
                      ? "nothing planned"
                      : `${finished} of ${list.length} done`
                }`}
                className={cx(
                  "flex min-h-20 flex-col items-center gap-1 rounded-md border px-1 py-2 text-center transition-colors duration-150",
                  d === day
                    ? "border-accent bg-accent-tint"
                    : "border-border-subtle bg-surface-200",
                  list.length === 0 && !isGoal && "text-ink-subtle",
                )}
              >
                <span className="type-caption text-ink-muted">
                  {WEEKDAYS[(weekdayOf(d) + 6) % 7]}
                </span>
                <span
                  className={cx(
                    "type-label tabular-nums",
                    d === today ? "rounded-pill bg-accent px-2 text-on-accent" : "text-ink",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {isGoal ? (
                  <span className="badge badge--warning">Goal</span>
                ) : list.length > 0 ? (
                  <>
                    <span
                      className="h-1 w-full max-w-10 rounded-pill bg-neutral-tint"
                      aria-hidden="true"
                    >
                      <span
                        className={cx(
                          "block h-1 rounded-pill",
                          all ? "bg-success" : "bg-accent-muted",
                        )}
                        style={{ width: `${Math.min(100, (planned / plan.minutesPerDay) * 100)}%` }}
                      />
                    </span>
                    <span className="type-caption text-ink-muted tabular-nums">
                      {finished}/{list.length}
                    </span>
                  </>
                ) : null}
              </button>
            );
          })}
        </fieldset>
      </section>

      <section className="flex flex-col gap-3" aria-label="Tasks for the day">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="type-heading-3 text-ink">
            {day === today
              ? "Today"
              : formatDay(day, { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {dayItems.length > 0 && dayMin > 0 && (
            <span className="type-caption text-ink-muted">
              {minutesLabel(dayMin)} of {minutesLabel(plan.minutesPerDay)}
            </span>
          )}
        </div>
        {dayItems.length === 0 ? (
          <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
            <p className="text-ink-muted">
              {day === plan.goalDate
                ? "This is the goal day. You are ready."
                : plan.studyDays.includes(weekdayOf(day))
                  ? "Nothing planned for this day."
                  : "Not a study day."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
            {dayItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                detail={item.contentId ? view.contentTitles[item.contentId] : undefined}
                href={itemHref(item, plan)}
                onToggle={(done) => void toggle(item, done)}
                onEdit={() => setEditing(item)}
              />
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <EditItemDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            onChanged();
          }}
          planId={planId}
        />
      )}
      {deleting && (
        <Dialog
          title="Delete this plan?"
          onClose={() => setDeleting(false)}
          actions={
            <>
              <CancelButton onClick={() => setDeleting(false)} />
              <Button
                variant="danger"
                onClick={async () => {
                  await deletePlanAction(planId);
                  onChanged();
                  router.replace("/planner");
                }}
              >
                Delete plan
              </Button>
            </>
          }
        >
          <p className="modal__body">
            “{plan.title}” and its {items.length} tasks will be removed. Your content, quizzes and
            cards stay.
          </p>
        </Dialog>
      )}
    </div>
  );
}

function EditItemDialog({
  planId,
  item,
  onClose,
  onSaved,
}: {
  planId: PlanId;
  item: PlanItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [minutes, setMinutes] = useState(String(item.minutes));
  const [day, setDay] = useState(item.day);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog title="Edit task" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const r = await editItemAction(planId, item.id as PlanItemId, {
            title,
            minutes: Number(minutes),
            day,
          });
          setSaving(false);
          if (r.ok) onSaved();
          else setError(r.error);
        }}
      >
        <div className="field max-w-none">
          <label className="field__label" htmlFor="item-title">
            Name
          </label>
          <input
            id="item-title"
            className="field__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="field max-w-none">
            <label className="field__label" htmlFor="item-minutes">
              Minutes
            </label>
            <input
              id="item-minutes"
              className="field__input"
              type="number"
              min={0}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <div className="field max-w-none">
            <label className="field__label" htmlFor="item-day">
              Day
            </label>
            <input
              id="item-day"
              className="field__input"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="callout callout--danger">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <CancelButton onClick={onClose} />
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
