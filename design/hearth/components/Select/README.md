A dropdown for picking one option from a list of five or more.

**You provide:** a native `<select class="select">` wrapped in `<span class="select-wrap">` with the chevron icon, inside a `field` with a label.

**Anatomy:** matches TextField: 44px tall, `surface-200`, 1px `border-control`, `radius-md`. Chevron 16px in `ink-muted`, 12px from the right edge. Hover moves the border to `ink-muted`.

**Do**
- Keep the native element, so keyboard, screen readers and mobile pickers work for free.
- Order options logically (alphabetical, or most used first) and preselect a sensible default.

**Don't**
- Use a select for two or three options; show them as radio buttons or a segmented choice.
- Build a custom listbox unless you need search or rich rows; then use the Menu styling with full ARIA.
