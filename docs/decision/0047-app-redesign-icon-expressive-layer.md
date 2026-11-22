# ADR-0047: The app gets an icon, an expressive layer, spring motion and a little glass

- Status: Accepted; amended by ADR-0050 (a second theme)
- Date: 2026-11-22
- Amends: ADR-0009, ADR-0020
- Builds on: ADR-0046

## Context

The landing page (ADR-0046) found a look the owner loves: "Hearth, turned up", with springy motion. The app itself still looked plain, and its mark was a serif "T".

The owner asked for:

- the same feel in the app;
- an icon with meaning;
- "some liquid glass, not much, so it feels like an app rather than a web page".

The owner's limit was **bold chrome, calm reading**. Reading surfaces stay quiet.

## Decision

1. **The icon.** An ibis head under the moon (Thoth, god of writing and the moon), drawn flat and simple, in the spirit of the Docker and DeepSeek animals.
   - **Masters:** in `design/brand/`, in three forms: the tile, a small cut for 16–32 px, and a `currentColor` mark.
   - **Components:** `ThothIcon` and `ThothMark` in `@thoth/ui`.
   - **Where it appears:**
     - the app sidebar;
     - the favicons;
     - the PWA icons, rendered from the master;
     - the desktop app icons, generated with `tools/render-brand-icon.mjs` and `tauri icon`;
     - the landing site.
2. **One expressive layer for the app and the site,** in `@thoth/ui`.
   - **`styles/expressive.css`:**
     - tones (`tone-peach`, `tone-sage`, `tone-sky`, `tone-butter`, `tone-lilac`);
     - glows;
     - `type-hero`;
     - 3D helpers;
     - `glass`.
   - **`motion.ts`:** the springs, snappy, smooth, gentle and bouncy.

   All of it is built from Hearth tokens with `color-mix`; there is no hex. This amends ADR-0009: tones may fill cards, tiles and chips in chrome, but **never sit behind reading text** (PDF, transcript, notes, chat answers, whiteboard content).
3. **Motion: `motion` 14.10.1 in `apps/web`,** under `LazyMotion` and `MotionConfig reducedMotion="user"`. This amends ADR-0020's motion rule: springs replace fixed durations for presses, panels, cards and lists; CSS keyframes stay for things like the palette opening. With `prefers-reduced-motion`, transforms are dropped. The e2e suite runs with reduced motion, so journeys never wait on animation.
4. **Glass, lightly.**
   - **Where:** the sidebar, the command palette, dialogs and the home composer card. They are translucent and blurred, over soft ambient light painted behind the app frame.
   - **Reduced transparency:** with `prefers-reduced-transparency`, the glass turns opaque.
   - **Never:** on reading surfaces.
5. **Where the colour goes** (doc 11 has the full list):
   - **Home:** the at-a-glance tiles count up, recents are tinted by kind (`features/library/kind-tone.ts`), and space tiles take each space's own accent.
   - **Review:** a 3D flip, rating buttons tinted by meaning, and cards that fly off.
   - **Quiz:** a spring progress bar, and feedback that pops in, or shakes when wrong.
   - **Spaces, progress and habits:** tinted number tiles, and a score ring.
   - **Sidebar:** icon tiles.

## Consequences

- The app and the landing page share one look. A change to a tone or a spring changes both.
- The landing page's screenshots, retaken by `site-shots.ts`, show the redesigned app with no other work.
- The sidebar is rendered per page, so its current-page pill springs in when a page opens. It does not slide from the previous item. Moving `AppShell` into a shared layout would make it slide; that is left for later.
- `motion` adds about 60 KB to the app's client JavaScript, loaded lazily.
