# ADR-0009: Hearth design system, vendored, with generated CSS tokens

- Status: Accepted
- Date: 2026-11-15

## Context

The owner maintains **Hearth**, a warm-minimal design system published as a claude.ai Design System artifact: https://claude.ai/artifact/MQ8f1U1mhEhwRbs2LzJxEW. Fetching it in every session is slow. Its generated `tokens.css` was stale (wrong sans font, missing `primary` tokens).

## Decision

- **Vendor** the artifact's `project/` files into `design/hearth/`. This covers the README brand book, `tokens.json`, the component guidelines and `bundle.css`. Treat the folder as read-only. Re-sync it from the artifact when Hearth changes.
- **`design/hearth/tokens.json` is the single source of truth.** `pnpm --filter @thoth/ui tokens` runs `packages/ui/scripts/build-tokens.ts`, which generates:
  - `tokens.css`: CSS variables. Light is the default, dark comes from `prefers-color-scheme` or `[data-theme="dark"]`.
  - `theme.css`: the Tailwind v4 `@theme` mapping (`bg-surface-200`, `text-ink`, `rounded-lg`, `shadow-hearth-md`) plus `type-*` utilities (`type-heading-2`, `type-body`).
  - `components.css`: Hearth's component classes (`btn`, `field`, `composer`, `nav-item`), imported into the `components` layer so utilities can override them.
- **React components in `@thoth/ui`** wrap Hearth classes with typed props. `Button` is the pattern.
- Fonts (Geist, Newsreader, JetBrains Mono) are loaded with `next/font/google`, which keeps the real family names the tokens reference.

## Consequences

- **No hard-coded colors or sizes in app code.** Use token utilities.
- Generated files are committed and excluded from Biome. Never edit them by hand.
- Tailwind theme keys for radius and fonts are literal values, and shadows use a `hearth-` prefix. This avoids `--x: var(--x)` cycles with Hearth's variables of the same name.
