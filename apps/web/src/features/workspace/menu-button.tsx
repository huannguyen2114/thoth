"use client";

import { cx } from "@thoth/ui";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ChevronIcon } from "./icons";

export type MenuEntry =
  | {
      kind: "item";
      id: string;
      label: string;
      icon?: ReactNode;
      /** Right-aligned hint, for example "Open". */
      hint?: string;
      onSelect: () => void;
    }
  | { kind: "sep"; id: string };

/**
 * Hearth Menu (design/hearth/components/Menu) opened from a ghost button. Arrow keys, Home
 * and End move between items; Escape or a click outside closes it and returns focus.
 */
export function MenuButton({
  label,
  icon,
  entries,
  align = "end",
}: {
  label: string;
  icon?: ReactNode;
  entries: MenuEntry[];
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown"
        ? items[(i + 1) % items.length]
        : e.key === "ArrowUp"
          ? items[(i - 1 + items.length) % items.length]
          : e.key === "Home"
            ? items[0]
            : e.key === "End"
              ? items.at(-1)
              : undefined;
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    } else if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        className="btn btn--ghost btn--sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {label}
        <ChevronIcon />
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cx("menu absolute top-full z-30 mt-1", align === "end" ? "right-0" : "left-0")}
        >
          {entries.map((e) =>
            e.kind === "sep" ? (
              <hr key={e.id} className="menu__sep border-0" />
            ) : (
              <button
                key={e.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="menu__item"
                onClick={() => {
                  close();
                  e.onSelect();
                }}
              >
                {e.icon}
                <span className="flex-1">{e.label}</span>
                {e.hint && <kbd>{e.hint}</kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
