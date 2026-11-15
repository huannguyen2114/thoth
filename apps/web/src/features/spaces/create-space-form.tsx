"use client";

import { Button, cx } from "@thoth/ui";
import { useActionState } from "react";
import { type CreateSpaceState, createSpaceAction } from "./actions";

const initial: CreateSpaceState = { error: null };

export function CreateSpaceForm() {
  const [state, action, pending] = useActionState(createSpaceAction, initial);
  return (
    <form action={action} className={cx("field", "max-w-none", state.error && "field--error")}>
      <label htmlFor="space-name" className="field__label">
        New space
      </label>
      <div className="flex gap-2">
        <input
          id="space-name"
          name="name"
          className="field__input flex-1"
          placeholder="For example, Neuroscience 101"
          aria-describedby={state.error ? "space-name-error" : undefined}
        />
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating" : "Create space"}
        </Button>
      </div>
      {state.error && (
        <p id="space-name-error" className="field__help" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
