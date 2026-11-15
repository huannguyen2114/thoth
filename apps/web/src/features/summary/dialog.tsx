"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * Hearth modal on a native <dialog>: the browser gives us the focus trap, Escape to close and
 * focus return. Children mount only while open, so forms reset every time.
 * Guideline: design/hearth/components/Modal/README.md
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="modal m-auto max-h-screen overflow-y-auto backdrop:bg-scrim"
    >
      {open && (
        <>
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          {children}
        </>
      )}
    </dialog>
  );
}
