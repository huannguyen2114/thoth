# 05. Frontend and design system

Status: Current (Phase 0). Decisions: ADR-0009, ADR-0011, ADR-0012, ADR-0007.

## Hearth pipeline

```mermaid
flowchart LR
  A[Hearth artifact<br/>claude.ai] -->|re-sync by hand| H[design/hearth/<br/>tokens.json, README, components]
  H -->|pnpm --filter @thoth/ui tokens| G[packages/ui/src/styles/<br/>tokens.css · theme.css · components.css]
  G --> I[packages/ui/src/styles/index.css]
  I -->|@import| W[apps/web/src/app/globals.css]
```

**Before building any UI, read `design/hearth/README.md`** (the brand book) and the guideline at `design/hearth/components/<Comp>/README.md`.

## Expressive layer and brand (ADR-0047)

- `packages/ui/src/styles/expressive.css` is hand-written, not generated. It holds the tones, glows, `type-hero` and `type-hero-sm`, the 3D helpers and `glass`, all from Hearth tokens. `index.css` imports it, so the app and the landing site share it.
- `packages/ui/src/motion.ts` exports `spring`, the shared spring transitions.
- `ThothIcon` and `ThothMark` (`packages/ui/src/components/thoth-mark.tsx`) are the brand. The masters and the regeneration steps are in `design/brand/README.md`.

## Using tokens

| Need                            | Write                                                                                 | Not                       |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------- |
| Page, raised and sunken grounds | `bg-surface-100`, `bg-surface-200`, `bg-surface-300`                                  | `bg-white`, hex values    |
| Text                            | `text-ink`, `text-ink-muted`, `text-ink-subtle`                                       | `text-gray-*`             |
| Hairline                        | `border border-border-subtle`                                                         | `border-gray-200`         |
| Type                            | `type-display-lg`, `type-heading-2`, `type-body`, `type-caption`, `type-overline`     | `text-2xl font-bold`      |
| Radius                          | `rounded-md` (buttons, inputs), `rounded-lg` (cards), `rounded-xl` (composer, modals) | arbitrary `rounded-[7px]` |
| Shadow                          | `shadow-hearth-sm`, `shadow-hearth-md`, `shadow-hearth-lg`                            | `shadow-lg`               |
| Spacing                         | Tailwind steps, which follow Hearth's 4px base (`p-4` = `space-4`)                    | arbitrary px              |

- **Hearth component classes** (`btn`, `field`, `composer`, `nav-item`, `card`, `badge`, `callout`, `tabs`, `menu`, `modal`) are available. Prefer the typed React wrapper in `@thoth/ui` when one exists.
- **Typed components in `@thoth/ui`:** `Button`, `Select`, and `Dialog` (a native `<dialog>` modal: render it only while open; pass footer buttons as `actions`). Server Action results use `ActionResult` from `apps/web/src/lib/action-result.ts`.
- **Voice** (from Hearth): sentence case, verb-first buttons, errors that say what to do, no exclamation marks and no emoji.
- **One `primary` button per view.** The accent colour is used sparingly.

## Theming

- Light is the default. Dark follows `prefers-color-scheme` automatically.
- `[data-theme="light"|"dark"]` on `<html>` forces a theme. A settings toggle is planned for Phase 8.

## Next.js patterns

- **Routing only in `app/`.** Feature code lives in `features/<name>/`.
- **Reads:** an async Server Component with `await connection()`, inside `<Suspense fallback={<Skeleton/>}>`.
- **Writes:** a Server Action that calls a core use case, then `refresh()`. Forms use `useActionState` (see `features/spaces`).
- **Streaming LLM:** a Route Handler that returns SSE (Phase 3).
- **Read the Next 16 docs** in `apps/web/node_modules/next/dist/docs/` before using an unfamiliar API.

## PWA

- **Manifest:** `src/app/manifest.ts`.
- **Icons:** `src/app/pwa-icon/[size]/route.tsx`.
- **Service worker:** `public/sw.js`, registered by `src/app/_components/service-worker-register.tsx` in production only.
- **Offline fallback:** `src/app/offline/page.tsx`.
- **To check it:** run `pnpm build`, then `pnpm --filter @thoth/web start`, then open DevTools → Application. You should see the manifest, an active `sw.js`, and the `thoth-static-v1` cache.
