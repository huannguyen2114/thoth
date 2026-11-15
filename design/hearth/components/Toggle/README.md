A switch for a setting that takes effect immediately.

**You provide:** `<input type="checkbox" role="switch">` inside `<label class="toggle">` with a short label naming the setting, plus the handler that applies it.

**Anatomy:** 40 by 24px track in `radius-pill`. Off: track `border-control`. On: track `accent`. Thumb 18px in `surface-200`, slides 16px in 150ms. Gap to label `space-3`.

**Do**
- Name the setting, not the action ("Autosave drafts", not "Turn on autosave").
- Apply the change at once and show the result; no Save button.

**Don't**
- Use a toggle inside a form that saves on submit; use a Checkbox.
- Add "On/Off" text inside the track. The position and color plus the label carry the state.
