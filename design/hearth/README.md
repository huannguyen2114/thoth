Hearth is a warm-minimal design system for calm, readable software. Build every screen from `tokens.json`; never hard-code a color, size or radius.

## Principles

- **Quiet before clever.** Remove a decoration before adding one. One primary action per view, in ink; the orange accent is a highlight, not a wall.
- **Warm, not cold.** Grounds are cream (`surface-100`), never pure white or cool gray. Ink is warm near-black (`ink`), never `#000`.
- **Readable first.** Body text sits at 15px or 17px with generous leading, in a column no wider than about 65 characters.
- **Borders over shadows.** Separate things with a 1px `border-subtle`; lift only floating layers with a shadow.
- **Human, plain voice.** Write like a thoughtful person, not a system.

## Content fundamentals

- **Voice:** warm, direct, calm. Address the reader as "you". Refer to the product as "we" only when a person is clearly speaking.
- **Casing:** sentence case everywhere, including buttons and headings ("Save draft", not "Save Draft").
- **Buttons:** verb first, one to three words ("Continue", "Send invite").
- **Errors:** say what to do ("Enter a full address, like name@domain.com"), not who was wrong.
- **Empty states:** one sentence of reassurance plus one action ("Nothing here yet. Start a project to see it appear.").
- **No exclamation marks, no emoji as decoration, no jargon.** Numbers stay numerals ("3 files").
- **Examples:** "Autosave is on", "Invite sent", "Upload failed. The file is over 20 MB. Choose a smaller one."

## Color

- Page ground is `surface-100`. Raised things (cards, inputs, bubbles, composer) are `surface-200`. Recessed things (code, sidebars, hovered rows) are `surface-300`.
- Text is `ink`; secondary `ink-muted`; placeholders and tertiary `ink-subtle` (never on `surface-300`).
- Primary buttons are `primary` (warm near-black in light, cream in dark) with `on-primary` text. They carry the action; the accent does not.
- `accent` is the only brand hue, and it stays small: the send button, checked toggles and checkboxes, the selected-tab underline and one key icon per area. As text, use `accent-text`. On an accent fill, text is `on-accent`. Never fill a large button or panel with it.
- `accent-tint` is the soft version: selected rows, the person's message bubble, highlighted cards.
- `accent-muted` is for decorative shapes only (cover, illustrations, avatar grounds), never behind text.
- `neutral-tint` grounds neutral badges and nav hovers; it stays visible on dark grounds where `surface-300` would vanish.
- `scrim` dims the page behind modals. Tooltips invert: `ink` fill with `surface-100` text.
- Status colors (`success`, `warning`, `danger`, `info`) always come with a `-tint` background, an icon and a word. Success is a blue-leaning teal so it never relies on a green-versus-red difference.
- Controls are found by `border-control` (3:1), not `border-subtle` (decorative).
- Check both themes. Dark theme lifts the accent and flips `on-accent` to near-black; do not copy light values into dark.

## Typography

- **Serif (Newsreader)** for display and headings: `display-xl`, `display-lg`, `heading-1` to `heading-3`. It gives the editorial, literary feel.
- **Sans (Geist)** for interface and body: `body-lg` (17px) for reading, `body` (15px) default, `label` (14px) for controls, `caption` (13px) for helper text.
- **Mono (JetBrains Mono)** for `code` only, on `surface-300`.
- Never set body copy in serif or headings in sans. Never go below 13px, except `overline` (12px, uppercase via the `.overline` class).
- Use at most three weights: 400 body, 500 label and heading, 600 emphasis.
- Headings use tight negative letter-spacing as defined by the style; do not add your own.

## Spacing and layout

- 4px base: `space-1` (4) through `space-24` (96). Every gap is a token.
- Component padding: `space-4` default, `space-6` for cards. Gap between related controls `space-2`; between stacked fields `space-4`; between sections `space-12`.
- Reading column max width 560px to 680px, centered. Wide layouts add whitespace instead of widening text.
- Mobile gutters are `space-4`; desktop page padding is `space-8` or more.

## Shape and elevation

- Radii: `radius-sm` (6) badges, `radius-md` (10) buttons and inputs, `radius-lg` (16) cards and callouts, `radius-xl` (24) composer and modals, `radius-pill` for chips and toggles.
- Round corners are the system's softness; do not mix sharp and round on one screen.
- Shadows: `shadow-sm` resting lift, `shadow-md` dropdowns and composer, `shadow-lg` modals. Never combine with a heavy border.

## Focus and accessibility

- Every interactive element shows a solid 2px `focus-ring` outline with 2px offset. Never remove it.
- Text meets 4.5:1 on its ground in both themes; large text and control borders meet 3:1.
- Status is never color alone. Target size is at least 40px tall for buttons, 44px for inputs.
- Respect `prefers-reduced-motion`.

## Iconography

- Outline icons only: 1.6px stroke, round caps and joins, drawn on a 16px or 20px grid, colored with `currentColor`.
- Icons sit beside a word whenever they carry meaning. Use `ink-muted` for decorative icons and the status color for status icons.
- No emoji as icons. No filled multicolor icons.

## Imagery

- Prefer warm, natural photography with soft light and muted color, or simple flat shapes built from the radius scale.
- No stock-photo people pointing at screens, no gradients, no glow effects.

## Logo

- No logo is provided. Set the product name in `display-lg` serif, `ink`, until a mark is supplied.


---

## Consuming this system (generated — do not edit)

Every path named below is under `project/` in this design system: read `project/api/tokens.md`, not `api/tokens.md`.

15 components are documented without a runnable `components/bundle.js`: read each component’s card, and its README where it has one (`components/<Comp>/README.md`), and build to those guidelines. Tokens: the values are on `api/tokens.md`; a Slides deck or Design canvas also takes `tokens.json` by file path.

**Read, per thing:** a component’s props, parts and examples: `api/components/<Comp>.md`; token values: `api/tokens.md`. After this README, fetch the cards and fonts you need in ONE message as parallel calls — none depends on another.

**Two rules.** Before you use a thing — a component, a token group, an icon, an asset — read its card from the index below; a value you did not read from a card is a guess. `tokens.json`, `manifest.json` and `design-system.json` are sources for tools: hand them over. `components/<Comp>/README.md` is the long-form second read a card links to; `SKILL.md` and `artifact-type/` beside them are authoring guidance, not needed to consume the system.

## Index (generated — do not edit)

**Tokens**

- `api/tokens.md` — Every token: surface, text, fill, border, palette, type, spacing, radius, shadow. (9.5k)

**Components** (`api/components/<Comp>.md`, 15)

- **Status**: `Badge` — A small label that states a status or category · `Callout` — A block-level message that explains what happened and what to do next
- **Actions**: `Button` — A single action
- **Surfaces**: `Card` — A grouped block of related content on surface-100
- **Forms**: `Checkbox` — A box for choosing any number of independent options, or for agreeing to one statement · `Select` — A dropdown for picking one option from a list of five or more · `TextField` — A labeled single-line input with optional helper or error text · `Toggle` — A switch for a setting that takes effect immediately
- **Content**: `CodeBlock` — Shows code as a block with a file bar, or inline inside a sentence
- **Patterns**: `Conversation` — The signature pattern: a quiet reading column with a soft composer, where the reader's words sit in a bubble and the reply sits directly on the page
- **Overlays**: `Menu` — A floating list of actions opened from a button · `Modal` — A dialog that interrupts the page for a decision that must be made now · `Tooltip` — A short label that names an icon-only control on hover and keyboard focus
- **Navigation**: `Sidebar` — The persistent left navigation of an app · `Tabs` — Switches between views of the same subject without leaving the page
