"use client";

import type { Chapter, ContentKind, Segment } from "@thoth/core";
import { cx } from "@thoth/ui";
import { useEffect, useRef, useState } from "react";
import { activeIndex, locatorLabel, locatorRef } from "./locator";
import { Tabs, tabPanelProps } from "./tabs";
import { useViewer, useViewerPosition } from "./viewer-context";

type OutlineTab = "chapters" | "transcript";

/**
 * Under the viewer: the Chapters tab (click to jump) and the Transcript tab, which follows
 * the video or the page in view while Auto scroll is on. YouLearn's "Chapters | Transcripts".
 */
export function SourceOutline({
  kind,
  chapters,
  segments,
}: {
  kind: ContentKind;
  chapters: Chapter[];
  segments: Segment[];
}) {
  const [tab, setTab] = useState<OutlineTab>(chapters.length > 0 ? "chapters" : "transcript");
  const [autoScroll, setAutoScroll] = useState(true);
  const textLabel = kind === "youtube" ? "Transcript" : "Text";

  return (
    <section aria-label="Source outline" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-1">
        <Tabs
          label="Source outline"
          idPrefix="outline"
          items={[
            { id: "chapters", label: "Chapters" },
            { id: "transcript", label: textLabel },
          ]}
          selected={tab}
          onSelect={setTab}
          className="flex-1 border-b-0"
        />
        <label className="toggle type-label shrink-0 text-ink-muted">
          <input
            type="checkbox"
            role="switch"
            aria-checked={autoScroll}
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto scroll
        </label>
      </div>
      <div {...tabPanelProps("outline", "chapters", tab === "chapters")} className="min-h-0 flex-1">
        <ChapterList chapters={chapters} autoScroll={autoScroll} />
      </div>
      <div
        {...tabPanelProps("outline", "transcript", tab === "transcript")}
        className="min-h-0 flex-1"
      >
        <TranscriptList segments={segments} autoScroll={autoScroll} />
      </div>
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
