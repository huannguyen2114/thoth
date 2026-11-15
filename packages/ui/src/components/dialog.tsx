"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "./button";

/**
 * Hearth modal: dims the page, moves focus in, closes on Escape, returns focus on close.
 * See design/hearth/components/Modal/README.md.
 */
export function Dialog({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="scrim flex flex-1 items-start justify-center overflow-y-auto rounded-none">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="modal flex flex-col gap-4"
        >
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          {children}
          <div className="modal__actions">{actions}</div>
        </div>
      </div>
    </div>
  );
}

export function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick}>
      Cancel
    </Button>
  );
}
