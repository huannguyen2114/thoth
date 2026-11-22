"use client";

import type { HistoryItem, SpaceDashboard } from "@thoth/core";
import { Button, cx } from "@thoth/ui";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { CountUp } from "@/app/_components/motion/primitives";
import { loadSpaceDashboardAction } from "./actions";

const tzOffset = () => new Date().getTimezoneOffset();
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The space's Overview tab (doc 22): continue where you left off, the exam countdown, what is
 * due, today's plan, weak topics and recent activity. Loaded through a Server Action because
 * "today" is the browser's day (ADR-0023).
 */
export function SpaceDashboardView({
  spaceId,
  onOpenTab,
}: {
  spaceId: string;
  onOpenTab: (tab: "chat" | "contents" | "exams") => void;
}) {
  const [data, setData] = useState<SpaceDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadSpaceDashboardAction(spaceId, tzOffset()).then(
      (r) => {
        if (!live) return;
        if (r.ok) setData(r.value);
        else setError(r.error);
      },
      () => live && setError("The overview did not load. Reload the page."),
    );
    return () => {
      live = false;
    };
  }, [spaceId]);

  if (error) {
    return (
      <div className="callout callout--danger" role="alert">
        <div>
          <p className="callout__title">No overview this time</p>
          <p className="callout__text">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) return <DashboardSkeleton />;

  if (data.contents.total === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-200 p-6">
        <h3 className="type-heading-3 text-ink">Nothing in this space yet</h3>
        <p className="mt-1 text-ink-muted">Add lectures or PDFs, then study them together here.</p>
        <Button className="mt-4" variant="primary" onClick={() => onOpenTab("contents")}>
          Add content
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {data.resume ? (
          <Link
            href={data.resume.href}
            className="flex flex-col gap-1 rounded-xl tone-peach p-5 no-underline transition-transform duration-150 hover:-translate-y-0.5"
          >
            <span className="type-overline opacity-80">
              {data.resume.reason === "recent" ? "Continue where you left off" : "Start here"}
            </span>
            <span className="truncate type-heading-2">{data.resume.title}</span>
          </Link>
        ) : (
          <Card label="Continue">
            <span className="text-ink-muted">Your contents are still being processed.</span>
          </Card>
        )}
        {data.countdown ? (
          <Link
            href="/planner"
            className="flex flex-col gap-1 rounded-xl tone-lilac p-5 no-underline transition-transform duration-150 hover:-translate-y-0.5"
          >
            <span className="type-overline opacity-80">{data.countdown.title}</span>
            <span className="type-heading-2">
              {data.countdown.daysLeft === 0
                ? "Today"
                : `${data.countdown.daysLeft} ${data.countdown.daysLeft === 1 ? "day" : "days"} left`}
            </span>
          </Link>
        ) : (
          <Card label="Ask across sources" tone="tone-lilac">
            <button
              type="button"
              className="text-left text-accent-text"
              onClick={() => onOpenTab("chat")}
            >
              Chat with all {data.contents.ready} sources at once
            </button>
          </Card>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          tone="tone-sky"
          label="Sources ready"
          value={`${data.contents.ready} of ${data.contents.total}`}
        />
        <Stat
          tone="tone-sage"
          label="Accuracy"
          value={data.progress.accuracy === null ? "None yet" : pct(data.progress.accuracy)}
        />
        <Stat tone="tone-butter" label="Answers" value={String(data.progress.answered)} />
        <Stat tone="tone-peach" label="Cards due" value={String(data.cards.due)} />
      </dl>

      {data.cards.sets.length > 0 && (
        <Section
          title="Due for review"
          action={
            <Link href="/review" className="btn btn--secondary btn--sm no-underline">
              Review {data.cards.due} {data.cards.due === 1 ? "card" : "cards"}
            </Link>
          }
        >
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
            {data.cards.sets.map((s) => (
              <li key={s.setId} className="flex items-center gap-3 px-4 py-2.5">
                <Link
                  href={`/content/${s.contentId}`}
                  className="min-w-0 flex-1 truncate text-ink no-underline hover:underline"
                >
                  {s.title}
                </Link>
                <span className="type-caption shrink-0 text-ink-muted">
                  {s.due} of {s.total} due
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.today.items.length > 0 && (
        <Section
          title="Today’s plan"
          action={
            <Link href="/planner" className="btn btn--ghost btn--sm no-underline">
              Open planner
            </Link>
          }
        >
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
            {data.today.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={i.doneAt ? "flex-1 text-ink-muted line-through" : "flex-1 text-ink"}
                >
                  {i.title}
                </span>
                <span className="type-caption text-ink-muted">{i.minutes} min</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.progress.weak.length > 0 && (
        <Section title="Weak topics">
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
            {data.progress.weak.map((t) => (
              <li key={`${t.contentId}-${t.topic}`} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink">{t.topic}</p>
                  <p className="type-caption truncate text-ink-muted">{t.contentTitle}</p>
                </div>
                <span className="type-caption shrink-0 tabular-nums text-ink-muted">
                  {pct(t.score)} · {t.answered}
                </span>
                <Link
                  href={`/content/${t.contentId}`}
                  className="btn btn--ghost btn--sm no-underline"
                >
                  Study
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent activity">
        {data.recent.length === 0 ? (
          <p className="text-ink-muted">Nothing yet. Open a source to start.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
            {data.recent.map((i) => (
              <ActivityRow key={i.id} item={i} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ActivityRow({ item }: { item: HistoryItem }) {
  const when = new Date(item.at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate">
        <span className="text-ink">{item.label}</span>
        {item.subject && <span className="text-ink-muted"> · {item.subject}</span>}
      </span>
      <span className="type-caption shrink-0 text-ink-muted">{when}</span>
    </>
  );
  return (
    <li>
      {item.href ? (
        <Link
          href={item.href}
          className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-surface-300"
        >
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>
      )}
    </li>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="type-heading-3 text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Card({ label, children, tone }: { label: string; children: ReactNode; tone?: string }) {
  return (
    <div
      className={cx(
        "flex flex-col gap-1 rounded-xl p-5",
        tone ?? "border border-border-subtle bg-surface-200",
      )}
    >
      <span className="type-overline text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

/** A tinted number tile (ADR-0047); whole numbers count up when they appear. */
function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={cx("flex flex-col gap-1 rounded-xl p-4", tone)}>
      <dt className="type-caption opacity-80">{label}</dt>
      <dd className="type-display-lg tabular-nums">
        {/^\d+$/.test(value) ? <CountUp value={Number(value)} /> : value}
      </dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-busy="true" aria-label="Loading">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-20 animate-pulse rounded-lg bg-surface-300" />
        <div className="h-20 animate-pulse rounded-lg bg-surface-300" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-300" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-lg bg-surface-300" />
    </div>
  );
}
