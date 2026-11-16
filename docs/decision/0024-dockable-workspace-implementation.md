# ADR-0024: How the dockable workspace is built

- Status: Accepted
- Date: 2026-11-16
- Amends: ADR-0021 (dockable content workspace)

## Context

ADR-0021 chose dockview 8.8.3 and called it "React, no dependencies". Building it showed four things the ADR did not settle:

1. **`dockview@8.8.3` has no React binding.** It re-exports `dockview-core` (which `pnpm` resolves to 8.9.0 through `^8.8.3`). The React components live in a separate package, `dockview-react`.
2. A YouTube `<iframe>` reloads whenever it is moved in the DOM, and dockview moves a panel's element when its tab is hidden or the panel is dragged.
3. The chat state lived inside the Phase 3 Learn panel. As a closable panel it would lose the thread, and an answer that is streaming, every time it closes.
4. A citation clicked while the Source panel is closed has no viewer to jump. The viewer mounts a moment after the panel is added back.

## Decision

1. **Use `dockview` (framework-free) with a small portal bridge** (`features/workspace/dock.tsx`) instead of adding `dockview-react`.
   - dockview owns the grid, tabs and drag and drop. Each panel body, each group's header action and the empty-state watermark is a plain element that dockview places.
   - React renders into those elements with `createPortal`, so panels keep reading the viewer, workspace and command contexts.
   - This keeps the dependency to the one package ADR-0021 allowed, and the bridge is about 100 lines.
2. **The Source panel uses dockview's `renderer: "always"`.** It stays in the page while hidden or dragged, so the video never reloads. Other panels detach while hidden; their React state stays because the portal stays mounted.
3. **The chat lives in the workspace** (`WorkspaceDataProvider`), not in the Chat panel. Closing and reopening the panel keeps the thread and any answer in flight.
4. **`ViewerProvider` queues a jump that has no viewer** and applies it on the next tick after a viewer registers, only if that viewer is still registered. This survives React Strict Mode's mount, unmount, mount. The PDF viewer likewise keeps a page asked for while the file loads.
5. **Layout storage.**
   - Key `thoth.workspace.layout` holds `{ v: 1, dock: SerializedDockview }`.
   - A layout with another version, broken JSON, an unknown panel, or no panels is ignored. If dockview rejects one that passed these checks, the dock is cleared and the Study preset is built.
   - Floating and popout groups are turned off and dropped from saved layouts.
   - Panels get a minimum size of 240 × 140 px, added on restore too, so a split cannot squeeze the chat header or a Learn tool into an unusable sliver.
6. **Phones** (under 768 px) skip dockview and show the same panel registry one at a time with a bottom tab bar. A panel stays mounted once opened; the Source is mounted from the start so citations always have a viewer. The chosen tab is remembered in `thoth.workspace.phoneTab`.
7. **Panels jump through the viewer, not through dockview.** `onCite` calls `jumpToToken`, and the workspace's `onJump` reveals the Source panel. Panels never touch the dock API.

## Consequences

- If dockview publishes breaking changes to `dockview-core` within `^8`, the lockfile protects us, but an upgrade must re-check the portal bridge and the `--dv-*` variables in `workspace.css`.
- Moving to `dockview-react` later is contained to `dock.tsx`.
- Saved layouts are per viewer and shared by all contents, as ADR-0021 says. Titles that depend on the content kind ("Transcript" or "Text") are set again after a layout loads.
- Floating panels and popout windows are not available. They can be turned on later with `disableFloatingGroups: false` and a `popoutUrl`.

## Alternatives considered

- **Add `dockview-react`:** official, but a second dependency outside this lane's allowance, and it would still need points 2 to 4.
- **Keep the YouTube player outside dockview and overlay it on the panel's box:** avoids the reload without `renderer: "always"`, but it duplicates what dockview already does.
