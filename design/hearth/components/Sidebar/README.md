The persistent left navigation of an app.

**You provide:** a `<nav aria-label>` with `nav-item` links, `aria-current="page"` on the active one, optional group headings, and a way to collapse it on small screens.

**Anatomy:** 240px wide, fill `surface-300`, padding `space-3`. Items 36px tall, `radius-md`, icon `ink-muted`, label `ink` at 14px. Hover fill `neutral-tint`. Current page: fill `accent-tint`, text and icon `accent-text`, weight 500. Group headings use `overline` in `ink-muted`.

**Do**
- Keep top-level items to about seven, each with an icon and a word.
- Truncate long item names with an ellipsis and show the full name on hover.

**Don't**
- Use `ink-subtle` here; it is not legible on `surface-300`.
- Mark more than one item as current.
