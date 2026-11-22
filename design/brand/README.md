# Thoth brand

Thoth's icon is an ibis head under the moon. Thoth, Egyptian god of writing, wisdom and the moon, is drawn as an ibis (ADR-0047). It is flat and simple on purpose, like the Docker whale.

| File                   | Use                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `thoth-icon.svg`       | The app icon: cream tile, terracotta ibis, peach moon. App stores, dock, the PWA, the landing page |
| `thoth-icon-small.svg` | The 16–32 px cut: bolder neck and beak, bigger eye and moon. Favicons                              |
| `thoth-mark.svg`       | The mark alone, in `currentColor`, with the eye cut out. Monochrome places                         |
| `thoth-icon-1024.png`  | Rendered from `thoth-icon.svg`, as the input for the desktop icons                                 |

In code, use `ThothIcon` (the tile) or `ThothMark` (the mark) from `@thoth/ui`. Do not copy the paths. The components and the SVGs share one path; change both together.

## Colours

These are Hearth's own: `surface-100` (cream), `accent` (terracotta) and `accent-muted` (peach). The icon keeps them in dark mode too, like any app icon.

## Regenerating the icons

```bash
node tools/render-brand-icon.mjs
pnpm --filter @thoth/desktop exec tauri icon ../../design/brand/thoth-icon-1024.png
rm -rf apps/desktop/src-tauri/icons/android apps/desktop/src-tauri/icons/ios
cp design/brand/thoth-icon-small.svg apps/web/src/app/icon.svg
cp design/brand/thoth-icon-small.svg apps/site/src/app/icon.svg
```

The PWA icons (`apps/web/src/app/pwa-icon/[size]`) render `thoth-icon.svg` directly.
