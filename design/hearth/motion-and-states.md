# Motion and states

Motion is small and quiet. It confirms an action; it never performs.

## Motion

- **Durations:** 150ms for hover and press, 200ms for menus and popovers, 300ms for modals and page-level shifts.
- **Easing:** `ease` for color and border changes; `cubic-bezier(0.2, 0, 0, 1)` for elements moving in; `ease-in` for elements leaving.
- **Distance:** translate no more than 8px. Scale presses to 0.98, never below.
- **Properties:** animate color, background, border, opacity and transform only. Never animate layout.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, replace movement with a plain fade or no transition.

## Interactive states

| State | Treatment |
| --- | --- |
| Default | Token fill and border as specified by the component |
| Hover | One step darker (`accent-hover`, `surface-300`) or border to `ink-muted` |
| Pressed | `accent-pressed` fill, scale 0.98 |
| Focus | 2px `focus-ring` outline, offset 2px, always visible with the keyboard |
| Disabled | 50% opacity, `not-allowed` cursor, plus helper text that says why |
| Selected | `accent-tint` fill with `accent-text` label |
| Loading | Replace the label with a spinner of the same width; keep the button size |
| Error | `danger` border or tint, icon and a fix-it sentence |

## Loading and empty

- Prefer skeleton blocks in `surface-300` (radius from the component) over spinners for content.
- Skeletons pulse opacity between 1 and 0.6 over 1.6s; stop under reduced motion.
- Empty state: serif `heading-3`, one `body` sentence in `ink-muted`, one primary button.
