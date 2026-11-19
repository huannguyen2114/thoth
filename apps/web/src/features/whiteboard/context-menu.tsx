"use client";

import { boardColors } from "@thoth/core";
import { cx } from "@thoth/ui";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Point } from "./model";

export interface MenuItem {
  id: string;
  label: string;
  kind?: "item" | "sep" | "colors";
  hint?: string;
  danger?: boolean;
  run: () => void;
  onColor?: (color: string) => void;
}

const colorNames: Record<string, string> = {
  yellow: "Yellow",
  peach: "Peach",
  pink: "Pink",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  white: "White",
};

/**
 * A Hearth Menu at a point on the canvas (right-click). Arrow keys move between items,
 * Escape or a click outside closes it.
 */
export function ContextMenu({
  at,
  items,
  onClose,
}: {
  at: Point;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  // Keep the menu inside the canvas.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    setPos({
      x: Math.max(8, Math.min(at.x, pw - el.offsetWidth - 8)),
      y: Math.max(8, Math.min(at.y, ph - el.offsetHeight - 8)),
    });
  }, [at]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  function onKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    const all = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length];
      next?.focus();
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      className="menu absolute z-10"
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => {
        if (item.kind === "sep") return <hr key={item.id} className="menu__sep border-0" />;
        if (item.kind === "colors") {
          return (
            <div key={item.id} className="flex items-center gap-1 px-2 py-1">
              {boardColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="menuitem"
                  aria-label={colorNames[c]}
                  title={colorNames[c]}
                  className={cx("wb-tool", `wb-fill-${c}`)}
                  onClick={() => {
                    item.onColor?.(c);
                    onClose();
                  }}
                >
                  <span className="wb-swatch" />
                </button>
              ))}
            </div>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={cx("menu__item", item.danger && "menu__item--danger")}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            {item.label}
            {item.hint && <kbd>{item.hint}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
