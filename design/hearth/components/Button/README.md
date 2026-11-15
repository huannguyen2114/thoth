A single action. Use one primary button per view; everything else is secondary or ghost.

**You provide:** a visible text label (verb first: "Save draft", "Continue") and an onClick or form action.

**Variants**
- `btn--primary`: the one main action. Fill `primary` (ink), label `on-primary`. Hover `primary-hover`, pressed `primary-pressed`. In dark theme it turns cream with dark text.
- `btn--secondary`: second-most important action. Fill `surface-200`, border `border-control`.
- `btn--ghost`: low-emphasis actions such as Cancel. No border until hover (`surface-300`).
- `btn--danger`: destructive actions. `danger-tint` fill with a `danger` border and label.

**Sizes:** sm 32px, default 40px, lg 48px (large also uses `radius-lg`). Height and radius come from the scale, never custom.

**Do**
- Keep labels to one to three words, sentence case.
- Pair a destructive button with a confirmation step.
- Keep the 2px `focus-ring` outline; it must stay visible.

**Don't**
- Put two primary buttons side by side.
- Fill buttons with `accent`. Orange is for small controls (send, toggles, checkboxes); use `accent-text` for text-only links.
- Rely on opacity alone to explain a disabled state. Add helper text saying why.
