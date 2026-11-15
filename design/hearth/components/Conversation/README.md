The signature pattern: a quiet reading column with a soft composer, where the reader's words sit in a bubble and the reply sits directly on the page.

**You provide:** the message list, an input, and a send handler.

**Anatomy**
- Person's message: `accent-tint` bubble, `radius-lg`, right-aligned, `body`, max 85% wide.
- Reply: no bubble, no border, set straight on `surface-100` in `body-lg` (17px/27px) so long answers read like prose.
- Composer: `surface-200`, 1px `border-subtle`, `radius-xl`, `shadow-md`, round send button in `accent`. Focus draws the 2px `focus-ring` around the whole composer.
- Vertical gap between messages: `space-4`. Reading column max width 560px (about 65 characters).

**Do**
- Keep the reading column narrow and centered on wide screens.
- Give the send button an accessible name and keep it at 36px or larger.

**Don't**
- Wrap replies in cards or add avatars by default.
- Use `accent` as a bubble fill with long text; it is for the small send button only. Bubbles use `accent-tint`.
