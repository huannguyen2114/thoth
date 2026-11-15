A grouped block of related content on `surface-100`.

**You provide:** a title (serif, `heading-3`), body text, and at most one or two actions.

**Anatomy:** `surface-200` fill, 1px `border-subtle`, `radius-lg`, padding `space-6` (`space-5` on mobile). Title in `heading-3`, body in `body` colored `ink-muted`.

**Elevation:** cards are flat by default and separated by their border. Add `shadow-sm` only for a card that can be picked up or dragged. Never stack shadow and a heavy border.

**Do**
- Keep one idea per card.
- Let cards in a grid share the same width and `space-6` gaps.

**Don't**
- Put a colored left border on a card. Use a `badge` or `accent-tint` fill instead.
- Nest a card inside a card. Use `surface-300` for the inner area.
