Switches between views of the same subject without leaving the page.

**You provide:** a `role="tablist"` container, one `<button class="tab" role="tab">` per view with `aria-selected`, the matching `role="tabpanel"`, and arrow-key handling between tabs.

**Anatomy:** tabs sit on a 1px `border-subtle` line, `space-6` apart. Label style `label`. Inactive `ink-muted`, hover and selected `ink`. Selected tab gets a 2px `accent` underline.

**Do**
- Keep labels to one or two words and two to six tabs.
- Remember the selected tab when people come back.

**Don't**
- Use tabs for steps in a sequence; use a stepper or separate pages.
- Fill the selected tab with a color block. The underline is enough.
