A short label that names an icon-only control on hover and keyboard focus.

**You provide:** the trigger (usually an icon button with `aria-label`), a `<span class="tooltip" role="tooltip">` linked by `aria-describedby`, and show/hide on hover and focus with about 400ms delay in.

**Anatomy:** inverted colors for contrast on any ground: fill `ink`, text `surface-100`, `caption` size at weight 500, `radius-sm`, padding `space-1` by `space-2`. Sits `space-2` above the trigger.

**Do**
- Keep it to a few words that name the action ("Copy link").
- Show it on keyboard focus too, and hide it with Escape.

**Don't**
- Put essential information or links inside a tooltip; it cannot be reached on touch.
- Use it on controls that already have a visible text label.
