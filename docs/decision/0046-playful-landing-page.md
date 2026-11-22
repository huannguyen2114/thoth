# ADR-0046: A playful landing page: spring motion, live demos and guided walkthroughs

- Status: Accepted
- Date: 2026-11-22
- Amends: ADR-0009 (on the landing site only), ADR-0044

## Context

The first landing page (ADR-0044) worked, but read like documentation. The owner asked for:

- a landing page that is playful, interactive and colourful;
- motion that feels like iOS or Material You;
- a demo that looks like the real app, using a real lecture and a small example chapter;
- walkthroughs that show where to click;
- the detailed tour kept on its own page.

## Decision

1. **Pages.**

   | Page         | What it is                                           |
   | ------------ | ---------------------------------------------------- |
   | `/`          | the playful landing                                  |
   | `/features`  | the documented tour with real screenshots, as before |
   | `/changelog` | from the roadmap                                     |
   | `/download`  | the installers                                       |

2. **Motion: `motion` 14.10.1** (formerly Framer Motion), in `apps/site` only.
   - All springs come from `apps/site/src/motion/tokens.ts`: snappy, smooth, gentle and bouncy.
   - Presses shrink, tabs and pills slide with `layoutId`, cards morph into place, and scroll drives the story.
   - With `prefers-reduced-motion`, movement is turned off and every demo still works.
3. **"Hearth, turned up"** (`apps/site/src/app/landing.css`). The landing site may use the following, all built from Hearth tokens with `color-mix`:
   - large tinted card grounds (peach, sage, sky, butter, lilac);
   - soft glows;
   - two display sizes, `type-hero` and `type-hero-sm`;
   - `aspect-shot`.

   There are no hex values. The app itself keeps ADR-0009 unchanged.
4. **The hero demo is a recreation of the content workspace,** drawn with the app's own Hearth classes and icons.
   - It has the sidebar, header, dock panels, chat with citation badges, a working "Add panel" menu, and panels that can be swapped by dragging their tabs or from Layout.
   - Its copy lives in `apps/site/content/landing.ts`.
5. **Real sources for the examples.**
   - **The lecture** is Martin Kleppmann's "Distributed Systems 6.1: Consensus", embedded from `youtube-nocookie.com`.
     - It loads only after the visitor clicks Play or a citation, so the page still makes no third-party request on its own (this narrows ADR-0044's "no third-party requests").
     - Chapter times and citations come from the lecture's transcript.
   - **The book example** is a short chapter we wrote. It is not text from Kleppmann's book. `scripts/make-example-pdf.ts` generates the downloadable PDF from the same text before every build.
   - The page says Thoth is not affiliated with him.
6. **Walkthroughs over real screens.**
   - Each step of the scroll story shows a cursor that moves to the real button, clicks, and shows a tip, over screenshots that `apps/web/e2e/site-shots.ts` takes from the current app.
   - The same script records each target's box into `apps/site/content/hotspots.json`, so the cursor lands on the button even after the UI changes.
7. **The freshness gate (ADR-0044) also checks the walkthroughs.** `pnpm site:check` fails when:
   - a walkthrough frame is not a screenshot the script takes;
   - a cursor target has no recorded hotspot.

## Consequences

- The landing page ships about 60 KB more JavaScript (motion). That is acceptable for a marketing page; the app is unaffected.
- The demos are scripted, so their wording must stay true to the app. The real-app screenshots and hotspots refresh themselves.
- If YouTube changes its embed messaging, the demo still plays the video, but citations stop seeking it. The facade and the chapters keep working.
