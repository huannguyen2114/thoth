"use client";

import { Button } from "@thoth/ui";
import { useEffect, useId, useRef, useState, useTransition } from "react";

const MAX = 2000;

/** Hearth Modal for the chat's custom instructions (YouLearn "Chat instructions"). */
export function InstructionsDialog({
  open,
  initial,
  isNewChat,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: string | null;
  isNewChat: boolean;
  onClose: () => void;
  /** Resolves to an error message, or null when saved. */
  onSave: (value: string) => Promise<string | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const titleId = useId();
  const helpId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setValue(initial ?? "");
      setError(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, initial]);

  function save() {
    startSaving(async () => {
      const problem = await onSave(value);
      if (problem) setError(problem);
      else onClose();
    });
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="modal m-auto max-w-lg text-ink backdrop:bg-scrim"
    >
      <h2 id={titleId} className="modal__title">
        Chat instructions
      </h2>
      <p id={helpId} className="modal__body">
        Tell Thoth how to answer, for example “Explain like I am new to biology” or “Answer in
        Vietnamese”. {isNewChat ? "They apply to this new chat." : "They apply to this chat."} New
        chats start with the latest instructions.
      </p>
      <div className={error ? "field field--error mt-4 max-w-none" : "field mt-4 max-w-none"}>
        <label className="field__label" htmlFor={`${titleId}-input`}>
          Instructions
        </label>
        <textarea
          id={`${titleId}-input`}
          className="field__input h-32 resize-y py-2"
          value={value}
          maxLength={MAX}
          aria-describedby={helpId}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="field__help">
          {error ?? `${value.length} of ${MAX} characters. Leave empty to use the defaults.`}
        </p>
      </div>
      <div className="modal__actions">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving" : "Save instructions"}
        </Button>
      </div>
    </dialog>
  );
}
