"use client";

import type { TodayItem } from "@thoth/core";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadTodayAction, setItemDoneAction } from "./actions";
import { itemHref, tzOffset } from "./format";
import { ItemRow } from "./item-row";

/**
 * Home page card: today's planned tasks across every plan, with checkboxes. Renders nothing
 * when there are no plans with work today (the home page stays calm). Loads through a Server
 * Action because "today" is the browser's day (ADR-0023).
 */
export function TodayCard() {
  const [data, setData] = useState<{ items: TodayItem[]; missed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadTodayAction(tzOffset()).then(
      (d) => live && setData(d),
      () => live && setData({ items: [], missed: 0 }),
    );
    return () => {
      live = false;
    };
  }, []);

  const toggle = useCallback(async (item: TodayItem, done: boolean) => {
    setError(null);
    const stamp = done ? new Date() : null;
    setData(
      (d) =>
        d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, doneAt: stamp } : i)) },
    );
    const r = await setItemDoneAction(item.planId, item.id, done);
    if (!r.ok) {
      setError(r.error);
      setData(
        (d) =>
          d && {
            ...d,
            items: d.items.map((i) => (i.id === item.id ? { ...i, doneAt: item.doneAt } : i)),
          },
      );
    }
  }, []);

  if (!data) {
    return <div className="h-32 animate-pulse rounded-lg bg-surface-300" aria-hidden="true" />;
  }
  const work = data.items.filter((i) => i.kind !== "rest" || i.doneAt === null);
  if (work.length === 0 && data.missed === 0) return null;
  const doneCount = data.items.filter((i) => i.doneAt).length;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="today-heading">
      <div className="flex items-end justify-between gap-4">
        <h2 id="today-heading" className="type-heading-2 text-ink">
          Today
        </h2>
        <Link href="/planner" className="type-label text-accent-text">
          {data.items.length > 0 ? `${doneCount} of ${data.items.length} done · ` : ""}Open planner
        </Link>
      </div>
      {error && (
        <p role="alert" className="callout callout--danger">
          {error}
        </p>
      )}
      {data.missed > 0 && (
        <p role="note" className="callout callout--info">
          {data.missed} task{data.missed === 1 ? "" : "s"} from earlier days{" "}
          {data.missed === 1 ? "is" : "are"} still open.{" "}
          <Link href="/planner" className="text-accent-text underline">
            Re-plan in the planner
          </Link>
        </p>
      )}
      {work.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
          {work.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              detail={item.planTitle}
              href={itemHref(item, { spaceId: item.planSpaceId })}
              onToggle={(done) => void toggle(item, done)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
