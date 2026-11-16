"use client";

import { type HistoryDay, type HistoryItem, localDay } from "@thoth/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadHistoryAction } from "./actions";

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function dayLabel(day: string, today: string): string {
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const diff = Math.round((ms(today) - ms(day)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ms(day)).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
}

/** The activity timeline (ADR-0023), newest day first. Client-loaded: day edges need the browser's timezone. */
export function HistoryView() {
  const [days, setDays] = useState<HistoryDay[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadHistoryAction(new Date().getTimezoneOffset())
      .then((d) => live && setDays(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed)
    return <p className="text-ink-muted">History could not be loaded. Reload to try again.</p>;
  if (!days) return <HistorySkeleton />;
  if (days.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-200 p-6">
        <h2 className="type-heading-3 text-ink">Nothing studied yet</h2>
        <p className="text-ink-muted">
          Answer a quiz question, review a card or ask the chat something, and it shows up here.
        </p>
        <Link href="/" className="type-label text-accent-text">
          Add content
        </Link>
      </div>
    );
  }

  const today = localDay(new Date(), new Date().getTimezoneOffset());
  return (
    <div className="flex flex-col gap-8">
      {days.map((d) => (
        <section key={d.day} aria-labelledby={`h-${d.day}`} className="flex flex-col gap-2">
          <h2 id={`h-${d.day}`} className="type-overline text-ink-muted">
            {dayLabel(d.day, today)} · {d.items.length}
          </h2>
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
            {d.items.map((it) => (
              <Row key={it.id} item={it} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({ item }: { item: HistoryItem }) {
  const body = (
    <>
      <span className="type-caption w-16 shrink-0 text-ink-muted tabular-nums">
        {time.format(item.at)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="type-body text-ink">{item.label}</span>
        {item.subject && (
          <span className="type-body truncate text-ink-muted"> · {item.subject}</span>
        )}
      </span>
    </>
  );
  const cls = "flex min-h-11 items-center gap-3 px-4 py-2 sm:min-h-10";
  return (
    <li>
      {item.href ? (
        <Link href={item.href} className={`${cls} no-underline hover:bg-surface-300`}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

function HistorySkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      role="status"
      aria-busy="true"
      aria-label="Loading history"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-300" />
      ))}
    </div>
  );
}
