Shows code as a block with a file bar, or inline inside a sentence.

**You provide:** the code text (escaped), an optional file name, and a Copy action. Syntax tokens are spans with `tok-key`, `tok-str` and `tok-com`.

**Anatomy:** `surface-300`, 1px `border-subtle`, `radius-lg`. Bar: `caption` in `ink-muted` with a ghost Copy button, hairline below. Code in the `code` style (`font-mono`, 14/22) in `ink`, padding `space-4`, scrolls horizontally rather than wrapping.

**Syntax colors** (all 5:1 or better on `surface-300` in both themes): keywords `accent-text`, strings `success`, comments `ink-muted` italic. Keep to these three.

**Inline code:** `code.inline` on `surface-300`, `radius-sm`, 0.9em mono.

**Don't**
- Use `ink-subtle` for comments; it fails on `surface-300`.
- Add a rainbow theme. Most text stays `ink`.
