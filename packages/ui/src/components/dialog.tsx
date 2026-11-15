"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "./button";

/**
 * Hearth modal on a native <dialog>, opened with showModal(): the browser traps focus, makes
 * the page behind inert, closes on Escape and returns focus to the opener.
 * Render it only while it should be open (`{open && <Dialog …/>}`), so forms reset each time.
 * Guideline: design/hearth/components/Modal/README.md
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
  /** Buttons in the footer. Omit when the children render their own (for example a form). */
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    const opener = el?.open ? null : (document.activeElement as HTMLElement | null);
    if (el && !el.open) el.showModal();
    // No cleanup close(): it fires "close" → onClose, which would unmount the dialog during
    // React's dev double-run of effects. Removing an open <dialog> from the DOM already takes
    // it out of the top layer and ends the page's inertness. Then focus returns to the
    // opener (while the dialog is still open the opener is inert, so this is a no-op).
    return () => opener?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      // Escape and form[method=dialog] fire "close"; the parent unmounts us in response.
      onClose={onClose}
      aria-labelledby={titleId}
      className="modal m-auto flex max-h-screen flex-col gap-4 overflow-y-auto backdrop:bg-scrim"
    >
      <h2 id={titleId} className="modal__title">
        {title}
      </h2>
      {children}
      {actions && <div className="modal__actions">{actions}</div>}
    </dialog>
  );
}

export function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick}>
      Cancel
    </Button>
  );
}
