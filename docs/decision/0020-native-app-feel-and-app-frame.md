# ADR-0020: Native app feel: fixed app frame, collapsible sidebar, Cmd+K, theme switch

- Status: Accepted
- Date: 2026-11-15

## Context

Thoth felt like a website: the whole page scrolled, the sidebar scrolled away with it so Settings was only reachable by scrolling, the sidebar could not be hidden, and there was no keyboard navigation. The owner wants it to feel like a desktop app (YouLearn, Notion, Claude Code).

## Decision

1. **A fixed app frame.**
   - `AppShell` fills the viewport (`h-dvh`, `overflow: hidden`). The sidebar and the main area each scroll on their own.
   - The page itself never scrolls.
   - Settings and the user area are pinned to the bottom of the sidebar.
2. **A collapsible sidebar.**
   - It toggles with a button and **Cmd/Ctrl + \\**.
   - Collapsed, it shows icons only, with tooltips.
   - The state is a per-viewer preference in `localStorage`. A cookie mirrors it so the server renders the right width with no flash.
   - On narrow screens the sidebar is an overlay drawer.
3. **A command palette on Cmd/Ctrl + K**, built with `cmdk` 1.1.1.
   - Step 0 ships the shell and a command registry (navigation, theme, toggle sidebar).
   - Global search results plug into it later (Lane 3).
4. **Keyboard shortcuts** go through one registry (`apps/web/src/app/_components/shortcuts.tsx`), so they are listed in the palette and never collide.
5. **Theme switch:** Light, Dark or System. It sets `data-theme` on `<html>`, which ADR-0009 tokens already support. It is stored like the sidebar state.
6. **Feel rules**, written in `docs/technical_design/11-app-shell-and-feel.md`:
   - No full-page spinners: use skeletons in place.
   - Optimistic updates where safe.
   - Hover and press states on everything clickable.
   - `cursor: default` and no text selection on chrome.
   - Motion follows Hearth's motion guide.
   - The browser's own focus ring is replaced by Hearth's.

## Consequences

- Every page must fit the frame: a page that needs its own scroll puts it in its content area, not on `body`.
- Per-viewer UI state lives in the browser, not the database (ADR-0002, single user).
