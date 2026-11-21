"use client";

import { placeLabel } from "@thoth/core";
import { cx } from "@thoth/ui";
import { useOptionalViewer } from "@/features/content-viewer/viewer-context";
import type { AnnotationDto } from "./actions";
import { COLORS } from "./colors";
import { refOfLocator } from "./open-link";
import { useAnnotations } from "./store";

const kindLabel: Record<AnnotationDto["kind"], string> = {
  highlight: "Highlight",
  comment: "Comment",
  ink: "Drawing",
  shape: "Shape",
};

/** The page, time or paragraph group an annotation is listed under. */
function groupOf(a: AnnotationDto): string {
  const page = a.payload?.page;
  if (page) return `Page ${page}`;
  const l = a.anchor.locator;
  if (!l) return "Whole source";
  if (l.type === "page") return `Page ${l.page}`;
  return placeLabel(l) ?? "Text";
}

/**
 * Every annotation of a content in reading order, grouped by page (or time or paragraph).
 * Clicking one jumps the source there and flashes it (doc 21). Fits any box: a drawer in the
 * PDF toolbar today, a dock panel later.
 */
export function AnnotationsList({
  contentId,
  onPicked,
}: {
  contentId: string;
  onPicked?: () => void;
}) {
  const { status, items, backlinks } = useAnnotations(contentId);
  const viewer = useOptionalViewer();

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-2 p-2" aria-hidden="true">
        <div className="h-10 animate-pulse rounded-md bg-surface-300" />
        <div className="h-10 animate-pulse rounded-md bg-surface-300" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-1 p-4">
        <h3 className="type-heading-3 text-ink">No annotations yet</h3>
        <p className="type-body text-ink-muted">
          Select text to highlight it, or pick the pen to draw on a page.
        </p>
      </div>
    );
  }

  const quoted = new Map((backlinks?.groups ?? []).map((g) => [g.key, g.sources.length] as const));
  const groups: { name: string; items: AnnotationDto[] }[] = [];
  for (const a of items) {
    const name = groupOf(a);
    const last = groups.at(-1);
    if (last?.name === name) last.items.push(a);
    else groups.push({ name, items: [a] });
  }

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name} className="flex flex-col">
          <h4 className="type-overline sticky top-0 bg-surface-200 px-3 pt-3 pb-1 text-ink-muted select-none">
            {g.name}
          </h4>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {g.items.map((a) => {
              const n = quoted.get(`a:${a.id}`) ?? 0;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-300"
                    onClick={() => {
                      viewer?.jumpTo({
                        kind: "annotation",
                        id: a.id,
                        near: refOfLocator(a.anchor.locator),
                      });
                      onPicked?.();
                    }}
                  >
                    <span
                      className={cx(
                        "mt-1.5 size-2.5 shrink-0 rounded-pill",
                        COLORS[a.color].swatch,
                      )}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="type-body line-clamp-2 text-ink">
                        {a.anchor.quote?.exact ?? a.comment ?? kindLabel[a.kind]}
                      </span>
                      {a.comment && a.anchor.quote && (
                        <span className="type-caption line-clamp-2 text-ink-muted">
                          {a.comment}
                        </span>
                      )}
                      <span className="type-caption text-ink-muted">
                        {kindLabel[a.kind]}
                        {n > 0 && ` · Quoted in ${n} ${n === 1 ? "note" : "notes"}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
