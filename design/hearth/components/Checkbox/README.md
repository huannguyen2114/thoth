A box for choosing any number of independent options, or for agreeing to one statement.

**You provide:** a native `<input type="checkbox">` inside a `<label class="check">` with the label text after it, so the whole row is clickable.

**Anatomy:** 20px box, 1.5px `border-control`, `radius-sm`, fill `surface-200`. Checked: fill and border `accent`, check mark `on-accent`. Gap to label `space-2`. Label in `body`.

**Do**
- Use for options that save on submit. For a setting that applies instantly, use a Toggle.
- Stack options vertically with `space-3` between rows.
- Explain why an option is disabled in the label or helper text.

**Don't**
- Use a checkbox for mutually exclusive choices; use radio buttons or a Select.
- Write negative labels ("Don't send emails"). Phrase options positively.
