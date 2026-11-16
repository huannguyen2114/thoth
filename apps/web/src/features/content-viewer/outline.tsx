"use client";

import type { Chapter, Segment } from "@thoth/core";
import { cx } from "@thoth/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { activeIndex, locatorLabel, locatorRef } from "./locator";
import { useViewer, useViewerPosition } from "./viewer-context";

/**
 * The Chapters and Transcript (or Text) panels. Click a row to jump the source; while
 * Follow is on, the list keeps the row for the current moment or page in view.
 */
export function ChaptersView({ chapters }: { chapters: Chapter[] }) {
  const [follow, setFollow] = useState(true);
  return (
    <OutlineFrame label="Chapters" follow={follow} onFollow={setFollow}>
      <ChapterList chapters={chapters} autoScroll={follow} />
    </OutlineFrame>
  );
}

export function TranscriptView({ segments, label }: { segments: Segment[]; label: string }) {
  const [follow, setFollow] = useState(true);
  return (
    <OutlineFrame label={label} follow={follow} onFollow={setFollow}>
      <TranscriptList segments={segments} autoScroll={follow} />
    </OutlineFrame>
  );
}

function OutlineFrame({
  label,
  follow,
  onFollow,
  children,
}: {
  label: string;
  follow: boolean;
  onFollow: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end border-b border-border-subtle px-3 py-1.5">
        <label className="toggle type-caption text-ink-muted">
          <input
            type="checkbox"
            role="switch"
            aria-checked={follow}
            checked={follow}
            onChange={(e) => onFollow(e.target.checked)}
          />
          Auto scroll
        </label>
      </div>
      <div className="min-h-0 flex-1 px-2">{children}</div>
    </section>
  );
}

/** Keeps the active row in view inside its own scroll box, without moving the page. */
function useFollow(active: number, enabled: boolean) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const box = list.current;
    if (!enabled || active < 0 || !box || box.offsetParent === null) return;
    const row = box.children[active] as HTMLElement | undefined;
    if (!row) return;
    const top = row.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: Math.max(0, top - box.clientHeight / 4), behavior: "smooth" });
    }
  }, [active, enabled]);
  return list;
}

function ChapterList({ chapters, autoScroll }: { chapters: Chapter[]; autoScroll: boolean }) {
  const { jump } = useViewer();
  const active = activeIndex(chapters, useViewerPosition());
  const list = useFollow(active, autoScroll);

  if (chapters.length === 0) {
    return (
      <p className="type-body px-2 py-6 text-ink-muted">
        No chapters yet. They appear once the source has been processed.
      </p>
    );
  }
  return (
    <ol ref={list} className="flex h-full flex-col gap-1 overflow-y-auto py-3">
      {chapters.map((c, i) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => jump(locatorRef(c.locator, c.idx))}
            aria-current={i === active ? "true" : undefined}
            className={cx(
              "flex w-full flex-col gap-1 rounded-lg p-4 text-left transition-colors hover:bg-surface-300",
              i === active && "bg-surface-300",
            )}
          >
            <span className="type-caption text-ink-muted tabular-nums">
              {locatorLabel(c.locator, c.idx)}
            </span>
            <span className="type-heading-3 text-ink">{c.title}</span>
            {c.summary && <span className="type-body text-ink-muted">{c.summary}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

function TranscriptList({ segments, autoScroll }: { segments: Segment[]; autoScroll: boolean }) {
  const { jump } = useViewer();
  const active = activeIndex(segments, useViewerPosition());
  const list = useFollow(active, autoScroll);

  if (segments.length === 0) {
    return <p className="type-body px-2 py-6 text-ink-muted">No text yet.</p>;
  }
  return (
    <ol ref={list} className="flex h-full flex-col gap-1 overflow-y-auto py-3">
      {segments.map((s, i) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => jump(locatorRef(s.locator, s.idx))}
            aria-current={i === active ? "true" : undefined}
            className={cx(
              "flex w-full gap-4 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-300",
              i === active && "bg-accent-tint",
            )}
          >
            <span className="type-caption w-12 shrink-0 pt-0.5 text-ink-muted tabular-nums">
              {locatorLabel(s.locator, s.idx)}
            </span>
            <span className="type-body text-ink">{s.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
