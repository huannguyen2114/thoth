"use client";

import { cx } from "@thoth/ui";
import { type KeyboardEvent, type ReactNode, useRef } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

/**
 * Hearth Tabs (design/hearth/components/Tabs): a tablist on a hairline with an accent
 * underline. Arrow keys, Home and End move between tabs. Panels use `tabPanelProps`.
 */
export function Tabs<T extends string>({
  label,
  items,
  selected,
  onSelect,
  idPrefix,
  className,
}: {
  label: string;
  items: TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  idPrefix: string;
  className?: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function onKeyDown(e: KeyboardEvent) {
    const i = items.findIndex((t) => t.id === selected);
    const next =
      e.key === "ArrowRight"
        ? items[(i + 1) % items.length]
        : e.key === "ArrowLeft"
          ? items[(i - 1 + items.length) % items.length]
          : e.key === "Home"
            ? items[0]
            : e.key === "End"
              ? items.at(-1)
              : undefined;
    if (!next) return;
    e.preventDefault();
    onSelect(next.id);
    refs.current.get(next.id)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={cx("tabs", className)} onKeyDown={onKeyDown}>
      {items.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            if (el) refs.current.set(t.id, el);
            else refs.current.delete(t.id);
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${t.id}`}
          aria-controls={`${idPrefix}-panel-${t.id}`}
          aria-selected={t.id === selected}
          tabIndex={t.id === selected ? 0 : -1}
          className="tab"
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function tabPanelProps(idPrefix: string, id: string, selected: boolean) {
  return {
    role: "tabpanel" as const,
    id: `${idPrefix}-panel-${id}`,
    "aria-labelledby": `${idPrefix}-tab-${id}`,
    hidden: !selected,
  };
}
