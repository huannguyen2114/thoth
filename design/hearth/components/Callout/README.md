A block-level message that explains what happened and what to do next.

**You provide:** an icon, a short bold title, and one sentence of detail. Add an action button only when the user can fix the problem right here.

**Variants:** `info`, `success`, `warning`, `danger`. Background is the matching `-tint`, text and icon the matching status color. Radius `radius-lg`, padding `space-4`, gap `space-3`.

**Rules**
- Set `role="alert"` for warning and danger, `role="status"` for success, `role="note"` for info.
- Title states the fact; detail states the next step. No exclamation marks.
- No colored side borders. The tint and icon carry the meaning.

**Don't**
- Stack more than two callouts on one screen.
- Use a callout for marketing content; use a `card` with an `accent-tint` fill.
