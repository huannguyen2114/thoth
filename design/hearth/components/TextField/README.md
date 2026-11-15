A labeled single-line input with optional helper or error text.

**You provide:** a `<label>` text, the input element, and helper text when the field has a format or limit.

**Structure:** label (`label` style) above, input 44px tall below, helper (`caption`, `ink-muted`) under it. Gap between parts is `space-2`.

**States**
- Default: fill `surface-200`, 1px `border-control`, `radius-md`.
- Hover: border moves to `ink-muted`.
- Focus: 2px `focus-ring` outline, offset 1px.
- Error: border `danger`, helper text `danger` with an alert icon and a sentence that says how to fix it.
- Placeholder: `ink-subtle`. A placeholder never replaces the label.

**Do**
- Write error text as an instruction ("Enter a full address"), not a verdict ("Invalid").
- Keep fields at most 360px wide unless they hold long text.

**Don't**
- Use `border-subtle` on an input; it is too faint to find the control.
- Show errors with red color alone. The icon and words are required.
