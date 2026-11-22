"use client";

import type { Habits as HabitsData, HeatmapCell } from "@thoth/core";
import { cx } from "@thoth/ui";
import { useEffect, useRef, useState } from "react";
import { CountUp } from "@/app/_components/motion/primitives";
import { loadHabitsAction } from "./actions";

/** Five Hearth steps: empty, then four accent strengths (light and dark both read as "more"). */
const LEVEL_CLASS = [
  "bg-surface-300",
  "bg-accent-tint",
  "bg-accent-muted",
  "bg-accent",
  "bg-accent-pressed",
] as const;

const fullDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const describe = (c: HeatmapCell) =>
  `${c.count === 0 ? "No activity" : `${c.count} ${c.count === 1 ? "action" : "actions"}`} on ${fullDate(c.day)}`;

/**
 * Habit tracker (ADR-0023): a 53-week heatmap with streaks. It loads through a Server Action
 * because day edges depend on the browser's timezone, which the server cannot know.
 * `compact` is the home-page strip; the full variant adds the stat cards used on Progress.
 */
export function Habits({ compact = false }: { compact?: boolean }) {
  const [habits, setHabits] = useState<HabitsData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadHabitsAction(new Date().getTimezoneOffset())
      .then((h) => live && setHabits(h))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-ink-muted">
        Your study activity could not be loaded. Reload to try again.
      </p>
    );
  }
  if (!habits) return <HabitsSkeleton compact={compact} />;

  const { stats, heatmap } = habits;
  return (
    <div className="flex flex-col gap-4">
      {compact ? (
        <p className="type-label text-ink-muted tabular-nums">
          <span className="text-ink">{stats.currentStreak}-day streak</span> · longest{" "}
          {stats.longestStreak} · {stats.thisWeek} this week · {stats.thisYear} this year
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat tone="tone-sage" label="Current streak" value={stats.currentStreak} unit="days" />
          <Stat tone="tone-butter" label="Longest streak" value={stats.longestStreak} unit="days" />
          <Stat tone="tone-sky" label="This week" value={stats.thisWeek} unit="actions" />
          <Stat tone="tone-peach" label="This year" value={stats.thisYear} unit="actions" />
        </div>
      )}
      <Grid heatmap={heatmap} />
    </div>
  );
}

/** A tinted habit tile (ADR-0047); the number counts up when it appears. */
function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1 rounded-xl p-4", tone)}>
      <span className="type-caption opacity-80">{label}</span>
      <span className="type-heading-1 tabular-nums">
        <CountUp value={value} /> <span className="type-caption opacity-80">{unit}</span>
      </span>
    </div>
  );
}

function Grid({ heatmap }: { heatmap: HabitsData["heatmap"] }) {
  const [picked, setPicked] = useState<HeatmapCell | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Start at today (the right edge) when the grid is wider than a phone.
  useEffect(() => {
    scroller.current?.scrollTo({ left: scroller.current.scrollWidth });
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div
          aria-hidden="true"
          className="type-caption grid shrink-0 grid-rows-7 gap-0.5 pt-5 text-ink-subtle"
        >
          {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed seven rows
            <span key={i} className="flex items-center leading-none">
              {d}
            </span>
          ))}
        </div>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div className="min-w-xl">
            <div
              aria-hidden="true"
              className="type-caption grid h-5 text-ink-subtle"
              style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, minmax(0, 1fr))` }}
            >
              {heatmap.months.map((m) => (
                <span
                  key={m.col}
                  className="whitespace-nowrap"
                  style={{ gridColumnStart: m.col + 1 }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <div
              role="img"
              aria-label="Study activity over the last year"
              className="grid grid-flow-col grid-rows-7 gap-0.5"
              style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, minmax(0, 1fr))` }}
            >
              {heatmap.weeks
                .flat()
                .map((c) =>
                  c.future ? (
                    <span key={c.day} className="aspect-square" />
                  ) : (
                    <button
                      key={c.day}
                      type="button"
                      tabIndex={-1}
                      title={describe(c)}
                      aria-label={describe(c)}
                      onClick={() => setPicked(c)}
                      className={cx(
                        "aspect-square cursor-default rounded-sm",
                        LEVEL_CLASS[c.level],
                        picked?.day === c.day && "ring-2 ring-focus-ring",
                      )}
                    />
                  ),
                )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="type-caption min-h-4 text-ink-muted" aria-live="polite">
          {picked ? describe(picked) : "Tap a day to see its count."}
        </p>
        <div className="type-caption flex items-center gap-1 text-ink-muted" aria-hidden="true">
          Less
          {LEVEL_CLASS.map((c) => (
            <span key={c} className={cx("size-3 rounded-sm", c)} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}

export function HabitsSkeleton({ compact }: { compact: boolean }) {
  return (
    <div
      className="flex flex-col gap-4"
      role="status"
      aria-busy="true"
      aria-label="Loading activity"
    >
      <div
        className={cx("animate-pulse rounded-lg bg-surface-300", compact ? "h-4 w-2/3" : "h-20")}
      />
      <div className="h-28 animate-pulse rounded-lg bg-surface-300" />
    </div>
  );
}
