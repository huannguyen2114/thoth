"use client";

import type { PlanItem } from "@thoth/core";
import { cx } from "@thoth/ui";
import Link from "next/link";
import { itemHint, kindBadge, kindLabel, minutesLabel } from "./format";

/**
 * One planned task: a checkbox row (the whole label toggles it), a kind badge, minutes and a
 * link to the work. Used by the plan's day list and the home page's Today card.
 */
export function ItemRow({
  item,
  href,
  detail,
  onToggle,
  onEdit,
}: {
  item: Pick<PlanItem, "id" | "kind" | "title" | "minutes" | "doneAt">;
  href: string | null;
  /** A second line, for example the plan's name. */
  detail?: string | undefined;
  onToggle: (done: boolean) => void;
  onEdit?: (() => void) | undefined;
}) {
  const done = item.doneAt !== null;
  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-2">
      <label className="check min-w-0 flex-1 py-1">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`${item.title}, ${done ? "done" : "not done"}`}
        />
        <span className="flex min-w-0 flex-col">
          <span className={cx("truncate", done && "text-ink-muted line-through")}>
            {item.title}
          </span>
          {detail && <span className="type-caption truncate text-ink-muted">{detail}</span>}
        </span>
      </label>
      <span className={cx("badge", kindBadge[item.kind])}>{kindLabel[item.kind]}</span>
      {item.kind !== "rest" && (
        <span className="type-caption w-14 text-right text-ink-muted tabular-nums">
          {minutesLabel(item.minutes)}
        </span>
      )}
      {href && (
        <Link
          href={href}
          className="type-label flex min-h-11 items-center px-1 text-accent-text"
          aria-label={`${itemHint[item.kind]}: ${item.title}`}
        >
          Open
        </Link>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="type-label min-h-11 px-1 text-ink-muted"
          aria-label={`Edit ${item.title}`}
        >
          Edit
        </button>
      )}
    </li>
  );
}
