"use client";

import type { BacklinkSource, Chapter, Segment } from "@thoth/core";
import { cx } from "@thoth/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { BacklinksButton, QuotedMarker } from "@/features/annotations/backlinks";
import { onAnnotationFlash, useAnnotations } from "@/features/annotations/store";
import { PassageText, useTextPassages } from "@/features/annotations/text-passages";
import { locatorIn, marksIn } from "@/features/annotations/text-ranges";
import { activeIndex, locatorLabel, locatorRef } from "./locator";
import { revealMark } from "./text-viewer";
import { useViewer, useViewerPosition } from "./viewer-context";

/** True while the owner is selecting text: a click that ends a selection is not a jump. */
const selecting = () => !(window.getSelection()?.isCollapsed ?? true);

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
  const contentId = segments[0]?.contentId;
  return (
    <OutlineFrame
      label={label}
      follow={follow}
      onFollow={setFollow}
      extra={contentId ? <BacklinksButton contentId={contentId} /> : null}
    >
      <TranscriptList segments={segments} autoScroll={follow} />
    </OutlineFrame>
  );
}

function OutlineFrame({
  label,
  follow,
  onFollow,
  children,
  extra,
}: {
  label: string;
  follow: boolean;
  onFollow: (on: boolean) => void;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section aria-label={label} className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border-subtle px-3 py-1.5">
        {extra}
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
  const contentId = chapters[0]?.contentId ?? "";
  const { toolbar } = useTextPassages({ contentId, root: list });

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
        // biome-ignore lint/a11y/useKeyWithClickEvents: the title button is the keyboard path; a click on the summary text is a mouse shortcut
        <li
          key={c.id}
          aria-current={i === active ? "true" : undefined}
          onClick={() => !selecting() && jump(locatorRef(c.locator, c.idx))}
          className={cx(
            "flex w-full flex-col gap-1 rounded-lg p-4 text-left transition-colors hover:bg-surface-300",
            i === active && "bg-surface-300",
          )}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              jump(locatorRef(c.locator, c.idx));
            }}
            className="flex flex-col gap-1 text-left"
          >
            <span className="type-caption text-ink-muted tabular-nums">
              {locatorLabel(c.locator, c.idx)}
            </span>
            <span className="type-heading-3 text-ink">{c.title}</span>
          </button>
          {c.summary && (
            <PassageText
              className="type-body text-ink-muted"
              text={c.summary}
              marks={[]}
              passageKey={c.id}
              locator={c.locator}
            />
          )}
        </li>
      ))}
      {toolbar}
    </ol>
  );
}

function TranscriptList({ segments, autoScroll }: { segments: Segment[]; autoScroll: boolean }) {
  const { jump } = useViewer();
  const active = activeIndex(segments, useViewerPosition());
  const list = useFollow(active, autoScroll);
  const contentId = segments[0]?.contentId ?? "";
  const { toolbar, items } = useTextPassages({ contentId, root: list });
  const { backlinks } = useAnnotations(contentId);
  // Re-subscribe when the highlights change, so a waiting jump finds its mark.
  // biome-ignore lint/correctness/useExhaustiveDependencies: items is the re-run trigger
  useEffect(() => onAnnotationFlash((id) => revealMark(list.current, id)), [items]);

  if (segments.length === 0) {
    return <p className="type-body px-2 py-6 text-ink-muted">No text yet.</p>;
  }

  // Which rows a note quotes: links at the row's position, or at a highlight inside it.
  const quotedBy = (s: Segment): BacklinkSource[] =>
    (backlinks?.groups ?? []).flatMap((g) => {
      const t = g.target;
      if (t.kind === "content") return locatorIn(t.locator, s.locator, s.idx) ? g.sources : [];
      if (t.kind === "annotation") {
        const a = items.find((x) => x.id === t.annotationId);
        return a && locatorIn(a.anchor.locator, s.locator, s.idx) ? g.sources : [];
      }
      return [];
    });
  return (
    <ol ref={list} className="flex h-full flex-col gap-1 overflow-y-auto py-3">
      {segments.map((s, i) => {
        const locator =
          s.locator.type === "offset"
            ? { ...s.locator, paragraph: s.locator.paragraph ?? s.idx + 1 }
            : s.locator;
        const quoted = quotedBy(s);
        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: the time button is the keyboard path; a click on the text is a mouse shortcut
          <li
            key={s.id}
            aria-current={i === active ? "true" : undefined}
            onClick={() => !selecting() && jump(locatorRef(s.locator, s.idx))}
            className={cx(
              "flex w-full gap-4 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-300",
              i === active && "bg-accent-tint",
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                jump(locatorRef(s.locator, s.idx));
              }}
              aria-label={`Go to ${locatorLabel(s.locator, s.idx)}`}
              className="type-caption w-12 shrink-0 self-start pt-0.5 text-left text-ink-muted tabular-nums"
            >
              {locatorLabel(s.locator, s.idx)}
            </button>
            <PassageText
              className="type-body min-w-0 flex-1 text-ink"
              text={s.text}
              marks={marksIn(
                s.text,
                items.filter((a) => locatorIn(a.anchor.locator, s.locator, s.idx)),
              )}
              passageKey={s.id}
              locator={locator}
            />
            {quoted.length > 0 && <QuotedMarker contentId={contentId} sources={quoted} />}
          </li>
        );
      })}
      {toolbar}
    </ol>
  );
}
