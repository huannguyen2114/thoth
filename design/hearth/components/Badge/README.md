A small label that states a status or category.

**You provide:** one to three words and, for statuses, an icon.

**Variants:** `neutral` (`neutral-tint` / `ink-muted`, stays visible on dark grounds), `accent`, `success`, `warning`, `danger`, `info`. Each pairs a `-tint` background with its matching text color.

**Rules**
- Success, warning, danger and info always carry an icon and a word. Color alone must never carry the status.
- Success is a blue-leaning teal and danger a red; they are not told apart by lightness, so the icon and word do that job.
- Use `radius-sm`, 12px `label` text, padding 2px by `space-2`.

**Don't**
- Use more than one badge per row item.
- Make a badge clickable. Use a `btn--sm` or a filter chip (`radius-pill`) instead.
