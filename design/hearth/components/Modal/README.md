A dialog that interrupts the page for a decision that must be made now.

**You provide:** a `role="dialog"` element with `aria-modal="true"` and `aria-labelledby`, a serif title, one or two sentences, actions, focus moved into the dialog on open and returned to the trigger on close, Escape to close.

**Anatomy:** page dimmed by `scrim`. Dialog `surface-200`, `radius-xl`, `shadow-lg`, padding `space-6`, max width 440px. Title in `heading-2` serif, body `ink-muted`. Actions right-aligned, `space-2` apart, `space-6` below the text; the safe action (Cancel) comes first.

**Do**
- Make the title a question for confirmations ("Delete this project?").
- Name the consequence in the body and repeat the verb on the button ("Delete project").

**Don't**
- Open a modal for information that could sit inline, or stack one modal on another.
- Use a primary (accent) button for a destructive action; use `btn--danger`.
